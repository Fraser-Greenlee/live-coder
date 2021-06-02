import { lineKey } from "./config";
import { AllFiles, ExecutedFunction } from "./executionClasses";


function isSnoopLine(line: string) {
    return line.startsWith('INFO:root:' + lineKey);
}

function lineCode(line: string) {
    // e.g. "INFO:root:4EmR7TzOvAICFVCp2wcU         20:10:20.44 >>> Call to..." -> ">>> Call to..."
    return line.substring('INFO:root:'.length + lineKey.length).trim().substring('20:10:20.44 '.length);
}

function isCallLine(code: string) { 
    return code.startsWith('>>> Call to ');
}

function isStateLine(code: string) {
    const dots = code.split(' ')[0];
    return dots === ".".repeat(dots.length);
}

function parseState(code: string) {
    return code.substring(code.split(' ')[0].length);
}

function getTab(code: string) {
    const pastVert = code.substring(code.indexOf('|')+1);
    return pastVert.length - pastVert.trimStart().length;
}

function isCodeLine(code: string) {
    return getLineNum(code) !== null;
}

function isReturnLine(code: string) {
    return code.startsWith('<<< Return value from');
}

function parseReturn(code: string) {
    const value = ('<<< Return value from ' + code.split(' ')[4]).length + 1
    return 'return ' + value;
}


function isGroupLine(code: string) {
    const tokens = code.split(' ');
    return tokens.length > 4 && ['for', 'while'].indexOf(tokens[3]) > -1;
}

function parseMethod(callCode: string) {
    const tokens = callCode.split(' ');
    const methodName = tokens[3];
    const lineNum = Number(tokens.slice(-1).pop());
    const path = callCode.substring(`>>> Call to ${methodName} in File "`.length, callCode.length - `", line ${lineNum}`.length);
    return {path, methodName, lineNum};
}

function getLineNum(line: string) {
    const tokens = line.split(' ');
    if (tokens[1] !== '|') {
        return;
    }
    const lineNum = Number(tokens[0]);
    if (typeof lineNum === "number") {
        return lineNum;
    }
}

function findPrevLineNum(lines: string[], i: number) {
    let lineNum = null;
    let c = i - 1;
    while (lineNum === null && c > -1) {

        if (!isSnoopLine(lines[c])) {
            continue;
        }

        const code = lineCode(lines[c]);
        if (isCallLine(code)) {
            lineNum = Number(code.split(' ').slice(-1).pop());
        } else {
            lineNum = getLineNum(code);
        }
        c -= 1;
    }
    return lineNum;
}

export function parseExecution(logs: string[]) {
    let allFiles: AllFiles = new AllFiles();
    let methodExecs: ExecutedFunction[] = new Array();

    let lines = logs.map( (l) => l.trim() );

    lines.forEach( (line, i) => {

        if (!isSnoopLine(line)) {
            return;
        }

        const code = lineCode(line);

        if (isCallLine(code)) {
            const {path, methodName, lineNum} = parseMethod(code);
            if (!lineNum) {
                throw new Error(`Missing line number for method "${line}".`);
            }
            const file = allFiles.getFile(path as string);
            const method = file.getMethod(methodName as string, lineNum as number);
            const aMethodExec = method.getExec({});

            if (methodExecs.length > 0) {
                const callToLineNum = findPrevLineNum(lines, i);
                if (callToLineNum) {
                    methodExecs.slice(-1)[0].addLine(callToLineNum, methodName, aMethodExec.callId, false);
                }
            }
            methodExecs.push(aMethodExec);

        } else if (isStateLine(code)) {
            const lineNum = findPrevLineNum(lines, i);
            if (!lineNum) {
                throw new Error(`Missing line number for state "${line}".`);
            }
            const value: string = parseState(code);
            methodExecs.slice(-1)[0].addLine(lineNum, value, null, null);

        } else if (isCodeLine(code)) {
            const lineNum = getLineNum(code);
            if (!lineNum) {
                throw new Error(`Missing line number for code line "${line}".`);
            }
            const tab: number = getTab(code);
            methodExecs.slice(-1)[0].handleGroup(lineNum, tab, isGroupLine(line));

        } else if (isReturnLine(code)) {
            const lineNum = getLineNum(lineCode(lines[i-1]));
            if (!lineNum) {
                throw new Error(`Missing line number for return line "${line}".`);
            }
            const value = parseReturn(code);
            if (methodExecs.length >= 2) {
                methodExecs[methodExecs.length-1].addLine(lineNum, value, methodExecs[-2].callId, true);
            }
            methodExecs.pop();
        }
    });

    return allFiles;
}