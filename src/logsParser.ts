import { split } from "./utils";
import { lineKey } from "./config";
import { AllFiles, ExecutedFunction } from "./executionClasses";


function isSnoopLine(line: string) {
    return line.startsWith(lineKey);
}

function lineCode(line: string) {
    // e.g. "4EmR7TzOvAICFVCp2wcU         20:10:20.44 >>> Call to..." -> ">>> Call to..."
    return line.substring(lineKey.length).trim().substring('20:10:20.44 '.length).trim();
}

function isCallLine(code: string) { 
    return code.startsWith('>>> Call to ');
}

function isErrorLine(code: string) {
    return code.startsWith('!!! ') || code.startsWith('??? ');;
}

function isErrorReturLine(errorContent: string) {
    return errorContent.startsWith('Call either returned None or ended by exception') || errorContent.startsWith('Call ended by exception');
}

function isStateLine(code: string) {
    const dots = split(code, ' ')[0];
    return dots === ".".repeat(dots.length);
}

function parseState(code: string) {
    return code.substring(split(code, ' ')[0].length).trim();
}

function getTab(code: string) {
    const pastVert = code.substring(code.indexOf('|')+1);
    return pastVert.length - pastVert.trimStart().length;
}

function isCodeLine(code: string) {
    return getLineNum(code) !== undefined;
}

function isYieldLine(code: string) {
    return code.startsWith('<<< Yield value from');
}

function isReturnLine(code: string) {
    return code.startsWith('<<< Return value from');
}

function parseYield(code: string) {
    const value = code.substring(('<<< Yield value from ' + split(code, ' ')[4]).length + 1);
    return 'yield ' + value.trim();
}

function parseReturn(code: string) {
    const value = code.substring(('<<< Return value from ' + split(code, ' ')[4]).length + 1);
    return 'return ' + value.trim();
}


function isGroupLine(code: string) {
    const tokens = split(code, ' ');
    return tokens.length > 2 && ['for', 'while'].indexOf(tokens[2]) > -1;
}

function parseMethod(code: string) {
    const tokens = split(code, ' ');
    const methodName = tokens[3];
    const lineNumTo = Number(tokens.slice(-1).pop());
    const path = code.substring(`>>> Call to ${methodName} in File "`.length, code.length - `", line ${lineNumTo}`.length);
    return {path, methodName, lineNumTo};
}

function getLineNum(line: string) {
    const tokens = split(line, ' ');
    if (tokens[1] !== '|') {
        return;
    }
    const lineNum = Number(tokens[0]);
    if (typeof lineNum === "number") {
        return lineNum;
    }
}

function findPrevLineNum(lines: string[], i: number) {
    let lineNum = undefined;
    let c = i - 1;
    while (lineNum === undefined && c > -1) {

        if (!isSnoopLine(lines[c])) {
            c -= 1;
            continue;
        }

        const code = lineCode(lines[c]);
        if (isCallLine(code)) {
            lineNum = Number(split(code, ' ').slice(-1).pop());
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

    let lines = logs.map( (l) => {
        l = l.trim();
        if (l.startsWith('INFO:root:')) {
            return l.substring('INFO:root:'.length);
        }
        return l;
    });

    let stdOutCollector: string[] = new Array();
    let errorCollector: string[] = new Array();

    lines.forEach( (line, i) => {

        if (i === 0) {
            return;
        }

        if (!isSnoopLine(line)) {
            stdOutCollector.push(line);

            let nextCode = '';
            if (i < lines.length-1) {
                nextCode = lineCode(lines[i+1]);
            }

            if ((isSnoopLine(nextCode) || i === lines.length-1) && stdOutCollector.length > 0) {

                if (methodExecs.length > 0) {
                    const lineNum = findPrevLineNum(lines, i);
                    if (lineNum) {
                        methodExecs[methodExecs.length-1].addLine(lineNum, stdOutCollector.join('\n'), null, "StdOut");
                    }
                }
                stdOutCollector = new Array();

            }

            return;
        }

        const code = lineCode(line);

        if (isCallLine(code)) {
            const {path, methodName, lineNumTo} = parseMethod(code);

            if (!lineNumTo) {
                throw new Error(`Missing line number (called to) for method "${line}".`);
            }

            const file = allFiles.getFile(path as string);
            const method = file.getMethod(methodName as string, lineNumTo as number);
            const aMethodExec = method.getExec({});

            if (methodExecs.length > 0) {
                const lineNumFrom = findPrevLineNum(lines, i);
                if (!lineNumFrom) {
                    throw new Error(`Missing line number (called from) for method "${line}".`);
                }
                methodExecs[methodExecs.length-1].addLine(lineNumFrom, methodName, aMethodExec.callId, null);
            }
            methodExecs.push(aMethodExec);

        } else if (isStateLine(code)) {
            const lineNum = findPrevLineNum(lines, i);
            if (!lineNum) {
                throw new Error(`Missing line number for state "${line}".`);
            }
            const value: string = parseState(code);
            methodExecs[methodExecs.length-1].addLine(lineNum, value, null, null);

        } else if (isErrorLine(code)) {
            let errorContent = code.substring(4, code.length);
            errorCollector.push(errorContent);

            let nextCode = '';
            if (i < lines.length-1) {
                nextCode = lineCode(lines[i+1]);
            }

            if ((!isErrorLine(nextCode) || i === lines.length-1) && errorCollector.length > 0) {

                let doesReturn = isErrorReturLine(errorCollector[errorCollector.length - 1]);
    
                let errorEndIndex: number = errorCollector.length - 2;
                if (doesReturn) {
                    errorEndIndex--;
                }
                const errorText = errorCollector.slice(0, errorEndIndex).join('\n');
    
                const lineNum = findPrevLineNum(lines, i);
                if (!lineNum) {
                    throw new Error(`Can't find line number for error "${errorText}".`);
                }
    
                let callId: string | null = null;
                if (doesReturn && methodExecs.length > 1) {
                    callId = methodExecs[methodExecs.length-2].callId;
                }
    
                methodExecs[methodExecs.length-1].addLine(lineNum, errorText, callId, "ErrorLine");
    
                if (doesReturn) {
                    methodExecs.pop();
                }
                errorCollector = new Array();
            }

        } else if (isCodeLine(code)) {
            const lineNum = getLineNum(code);
            if (!lineNum) {
                throw new Error(`Missing line number for code line "${line}".`);
            }
            const tab: number = getTab(code);
            methodExecs[methodExecs.length-1].handleGroup(lineNum, tab, isGroupLine(code));

        } else if (isReturnLine(code) || isYieldLine(code)) {
            let value: string;
            if (isReturnLine(code)) {
                value = parseReturn(code);
            } else {
                value = parseYield(code);
            }
            const lineNum = findPrevLineNum(lines, i);
            if (!lineNum) {
                throw new Error(`Missing line number for return/yield line "${line}".`);
            }
            if (methodExecs.length >= 2) {
                methodExecs[methodExecs.length-1].addLine(lineNum, value, methodExecs[methodExecs.length-2].callId, null);
            } else {
                methodExecs[methodExecs.length-1].addLine(lineNum, value, null, null);
            }
            methodExecs.pop();

        }
    });

    return allFiles;
}