import { AllFiles, ExecutedFunction } from "./executionClasses";

const LINE_KEY = '4EmR7TzOvAICFVCp2wcU ';


function isSnoopLine(line: string) {
    return line.startsWith(LINE_KEY);
}

function lineCode(line: string) {
    // e.g. "4EmR7TzOvAICFVCp2wcU         20:10:20.44 >>> Call to..." -> ">>> Call to..."
    return line.substring(LINE_KEY.length).trim().substring('20:10:20.44 '.length);
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


def parse_return(lines, i):
    line_num = get_line_num(lines[i-1])
    line = lines[i]
    return_value = line[len('08:35:31.67 <<< Return value from ') + len(line.split()[5]) + 1:]
    value = 'return ' + return_value
    return line_num, value

function isGroupLine(code: string) {
    const tokens = code.split(' ');
    return tokens.length > 4 && ['for', 'while'].indexOf(tokens[3]) > -1;
}

function parseMethod(callCode: string) {
    const tokens = callCode.split(' ');
    const methodName = tokens[3];
    const lineNum = Number(tokens[-1]);
    const path = callCode.substring(`>>> Call to ${methodName} in File "`.length, callCode.length - `", line ${lineNum}`.length);
    return [path, methodName, lineNum];
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
        const line = lines[c];
        if (isCallLine(line)) {
            lineNum = Number(line.split(' ')[-1]);
        } else {
            lineNum = getLineNum(lineCode(line));
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
            const [path, methodName, lineNum] = parseMethod(code);
            if (lineNum === null) {
                throw new Error(`Missing line number for method "${line}".`);
            }
            const file = allFiles.getFile(path as string);
            const method = file.getMethod(methodName as string, lineNum as number);
            const aMethodExec = method.getExec({});

            if (methodExecs.length > 0) {
                const callToLineNum = findPrevLineNum(lines, i);
                methodExecs[-1].addLine(callToLineNum, methodName, {callId: aMethodExec.callId});
            }
            methodExecs.push(aMethodExec);

        } else if (isStateLine(code)) {
            const lineNum = findPrevLineNum(lines, i);
            if (lineNum === null) {
                throw new Error(`Missing line number for state "${line}".`);
            }
            const value: string = parseState(code);
            methodExecs[-1].addLine(lineNum, value);

        } else if (isCodeLine(code)) {
            const lineNum = getLineNum(code);
            const tab: number = getTab(code);
            methodExecs[-1].handleGroup(lineNum, tab, isGroupLine(line));

        } else if (isReturnLine(code)) {
            const lineNum = getLineNum(lineCode(lines[i-1]));
            const value = parseReturn(code);
            if (methodExecs.length >= 2) {
                methodExecs[-1].addLine(lineNum, value, {callId: methodExecs[-2].call_id, isReturn: true});
            }
            methodExecs.pop();
        }
    });
}