import { split, Stack } from "./utils";
import { lineKey } from "./config";
import { AllFiles, ExecutedFunction } from "./executionClasses";


function isGroupLine(code: string) {
    const tokens = split(code, ' ');
    return tokens.length > 2 && ['for', 'while'].indexOf(tokens[2]) > -1;
}


class AllLines {
    private lines: string[];
    private code: (string|null)[];

    constructor (logLines: string[]) {
        const skipFirstLine = logLines.slice(1);
        this.lines = this.trimLines(skipFirstLine);
        this.code = this.getAllLineCode(this.lines);
    }

    private trimLines(logLines: string[]) {
        return logLines.map( (l) => {
            l = l.trim();
            if (l.startsWith('INFO:root:')) {
                return l.substring('INFO:root:'.length);
            }
            return l;
        });
    }

    private isSnoopLine(line: string) {
        return line.startsWith(lineKey);
    }

    private getLineCode(line: string) {
        // e.g. "4EmR7TzOvAICFVCp2wcU         20:10:20.44 >>> Call to..." -> ">>> Call to..."
        return line.substring(lineKey.length).trim().substring('20:10:20.44 '.length).trim();
    }

    private getAllLineCode(lines: string[]) {
        let code: (string|null)[] = new Array();
        lines.forEach( (line, i) => {
            if (!this.isSnoopLine(line)) {
                code.push(null);
                return;
            }
            code.push(this.getLineCode(this.lines[i+1]));
        });
        return code;
    }

    public getLine(i: number) {
        return this.lines[i];
    }

    public getLinesSlice(start: number, end: number) {
        return this.lines.slice(start, end);
    }

    public getPreviousLineNum(i: number) {
        let lineNum = undefined;
        const startI = i;

        i--;
        while (lineNum === undefined && i > -1) {

            const code = this.getCode(i);

            if (code === null) {
                i--;
                continue;
            }

            if (CallLineType.is(code)) {
                lineNum = CallLineType.getLineNum(code);
            } else if (CodeLineType.is(code)) {
                lineNum = CodeLineType.getLineNum(code);
            }
            i--;
        }

        if (!lineNum) {
            throw new Error(`Missing line number for "${this.lines[startI]}".`);
        }
        return lineNum;
    }

    public getCode(i: number) {
        return this.code[i];
    }

    public lineCount() {
        return this.lines.length;
    }
}


class StdOutLineType {

    public static is(code: string | null) {
        return code === null;
    }

    private static getLineCount(lines: AllLines, i: number) {
        let lineCount = 0;
        while (lines.getCode(i+lineCount) !== null) {
            lineCount++;
        }
        return lineCount;
    }

    public static parse(lines: AllLines, i: number) {

        const lineCount = StdOutLineType.getLineCount(lines, i);
        const stdOutLines: string[] = lines.getLinesSlice(i, i+lineCount);
        const stdOut = stdOutLines.join('\n');

        return {stdOut, lineCount};
    }
}


class CodeLineType {

    public static is(code: string) {
        return CodeLineType.getLineNum(code) !== null;
    }

    public static getLineNum(code: string) {
        const tokens = split(code, ' ');
        if (tokens[1] !== '|') {
            return;
        }
        const lineNum = Number(tokens[0]);
        if (typeof lineNum === "number") {
            return lineNum;
        }
    }

    public static getTab(code: string) {
        const pastVert = code.substring(code.indexOf('|')+1);
        return pastVert.length - pastVert.trimStart().length;
    }

    public static parse(code: string) {
        const lineNum = CodeLineType.getLineNum(code);
        if (!lineNum) {
            throw new Error(`Not true code line somehow got called "${code}".`);
        }
        const tab: number = CodeLineType.getTab(code);
        return {lineNum, tab};
    }
}

class CallLineType {

    public static is(code: string) {
        return code.startsWith('>>> Call to ');
    }

    private static parseCode(code: string) {
        const tokens = split(code, ' ');
        const methodName = tokens[3];
        const lineNumTo = Number(tokens.slice(-1).pop());
        const path = code.substring(`>>> Call to ${methodName} in File "`.length, code.length - `", line ${lineNumTo}`.length);
        return {path, methodName, lineNumTo};
    }

    public static getLineNum(code: string) {
        return Number(split(code, ' ').slice(-1).pop());
    }

    public static process(lines: AllLines, i: number) {
        const code = lines.getCode(i)!;

        const {path, methodName, lineNumTo} = CallLineType.parseCode(code);

        if (!lineNumTo) {
            throw new Error(`Missing line number (called to) for method "${code}".`);
        }

        const lineNumFrom = lines.getPreviousLineNum(i);
        return {path: path, methodName: methodName, lineNumTo: lineNumTo, lineNumFrom: lineNumFrom};
    }
}

class StateLineType {

    public static is(code: string) {
        const dots = split(code, ' ')[0];
        return dots === ".".repeat(dots.length);
    }

    public static parse(code: string) {
        return code.substring(split(code, ' ')[0].length).trim();
    }
}

class ErrorLineType {

    public static is(code: string) {
        return code.startsWith('!!! ') || code.startsWith('??? ');;
    }

    public static lineError(lines: AllLines, i: number) {
        let code = lines.getCode(i);
        if (code) {
            return code.substring(4);
        }
        return code;
    }

    public static parse(lines: AllLines, i: number) {
        let errorLineCount = 0;
        let error = ErrorLineType.lineError(lines, i + errorLineCount);
        while (error && ErrorLineType.is(error)) {
            errorLineCount++;
            error = ErrorLineType.lineError(lines, i + errorLineCount);
        }

        let errorMessageLineCount = errorLineCount-1;
        error = ErrorLineType.lineError(lines, i + errorMessageLineCount);
        if (ErrorLineType.isReturn(error!)) {
            errorMessageLineCount--;
        }

        return {error: lines.getLinesSlice(i, errorMessageLineCount).join('\n'), lineCount: errorLineCount};
    }

    public static isReturn(error: string) {
        return error.startsWith('Call either returned None or ended by exception') || error.startsWith('Call ended by exception');
    }
}

class YieldLineType {

    public static is(code: string) {
        return code.startsWith('<<< Yield value from');
    }

    public static parse(code: string) {
        const value = code.substring(('<<< Yield value from ' + split(code, ' ')[4]).length + 1);
        return 'yield ' + value.trim();
    }
}

class ReturnLineType {

    public static is(code: string) {
        return code.startsWith('<<< Return value from');
    }

    public static parse(code: string) {
        const value = code.substring(('<<< Return value from ' + split(code, ' ')[4]).length + 1);
        return 'return ' + value.trim();
    }
}


class ExecutionTracker {
    public lines: AllLines;
    public allFiles: AllFiles;
    private activeExecutions: Stack<ExecutedFunction>;

    constructor (lines: AllLines) {
        this.lines = lines;
        this.allFiles = new AllFiles();
        this.activeExecutions = new Stack();
    }

    private getNewMethod(path: string, methodName: string, lineNum: number) {
        const file = this.allFiles.getFile(path);
        return file.getMethod(methodName, lineNum);
    }

    private addCallLink(lineNum: number, methodName: string, callId: string) {
        let lastExec = this.activeExecutions.peak();
        if (lastExec) {
            lastExec.addLine(lineNum, methodName, callId, null);
        }
    }

    private startNewMethod(lineNumCalledFrom: number, path: string, methodName: string, lineNum: number) {
        const method = this.getNewMethod(path, methodName, lineNum);
        const newExecution = method.getExecution({});
        this.addCallLink(lineNumCalledFrom, method.name, newExecution.callId);
        this.activeExecutions.push(newExecution);
    }

    public processLineTypes(i: number) {

        let code = this.lines.getCode(i);

        if (StdOutLineType.is(code)) {

            const {stdOut, lineCount} = StdOutLineType.parse(this.lines, i);

            let currentExec = this.activeExecutions.peak();
            const lineNum = this.lines.getPreviousLineNum(i);
            if (currentExec && lineNum) {
                currentExec.addLine(lineNum, stdOut, null, "StdOut");
            }
    
            return i + lineCount;
        }

        // code is not not null
        code = code!;

        if (CallLineType.is(code)) {
            const {path, methodName, lineNumTo, lineNumFrom} = CallLineType.process(this.lines, i);
            this.startNewMethod(lineNumFrom, path, methodName, lineNumTo);

        } else if (StateLineType.is(code)) {
            const value: string = StateLineType.parse(code);
            const lineNum = this.lines.getPreviousLineNum(i);
            this.activeExecutions.peak()!.addLine(lineNum, value, null, null);

        } else if (ErrorLineType.is(code)) {

            const {error, lineCount} = ErrorLineType.parse(this.lines, i);
            const lineNum = this.lines.getPreviousLineNum(i);

            if (ErrorLineType.isReturn(error)) {
                // TODO: pop exec stack & add callId link
                let lastExec = this.activeExecutions.pop()!;
                let callingExec = this.activeExecutions.peak();
                let callId = '';
                if (callingExec) {
                    callId = callingExec.callId;
                }
                lastExec.addLine(lineNum, error, callId, "ErrorLine");
            } else {
                this.activeExecutions.peak()!.addLine(lineNum, error, null, "ErrorLine");
            }

            // skip to error message end
            return i + lineCount;

        } else if (CodeLineType.is(code)) {

            const {lineNum, tab} = CodeLineType.parse(code);
            this.activeExecutions.peak()!.handleGroup(lineNum, tab, isGroupLine(code));

        } else if (ReturnLineType.is(code) || YieldLineType.is(code)) {

            let value: string;
            if (ReturnLineType.is(code)) {
                value = ReturnLineType.parse(code);
            } else {
                value = YieldLineType.parse(code);
            }
            const lineNum = this.lines.getPreviousLineNum(i);
            if (!lineNum) {
                throw new Error(`Missing line number for return/yield line "${code}".`);
            }

            let lastExec = this.activeExecutions.pop()!;
            let callingExec = this.activeExecutions.peak();
            let callId = '';
            if (callingExec) {
                callId = callingExec.callId;
            }
            lastExec.addLine(lineNum, value, callId, null);

        } else {
            throw new Error(`Invalid line type: ${this.lines.getLine(i)}`);
        }
        return i;
    }
}

export function parseExecution(logLines: string[]) {

    let lines: AllLines = new AllLines(logLines);
    let tracker: ExecutionTracker = new ExecutionTracker(lines);

    for (let i = 0; i < lines.lineCount(); i++) {
        i = tracker.processLineTypes(i);
    }

    return tracker.allFiles;
}
