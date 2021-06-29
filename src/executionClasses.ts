import { Stack } from "./utils";

class AllFiles {
    public files: { [name: string]: File };

    constructor() {
        this.files = {};
    }

    public getFile(path: string) {
        if (!(path in this.files)) {
            this.files[path] = new File(path);
        }
        return this.files[path];
    }
}


class File {
    public path: string;
    public methods: { [name: string]: aFunction };

    constructor(path: string) {
        this.path = path;
        this.methods = {};
    }

    public getMethod(name: string, lineNum: number) {
        if (!(name in this.methods)) {
            this.methods[name] = new aFunction(this, name, lineNum);
        }
        return this.methods[name];
    }
}


class aFunction {
    public file: File;
    public name: string;
    public lineNum: number;
    public executions: ExecutedFunction[];

    constructor(file: File, name: string, lineNum: number) {
        this.file = file;
        this.name = name;
        this.lineNum = lineNum;
        this.executions = new Array();
    }

    public getExecution({i = null}: {i?: number | null }) {
        if (i === null) {
            i = this.executions.length;
            this.executions.push(
                new ExecutedFunction(this, i)
            );
        }
        return this.executions[i];
    }
}


class ExecutedFunction {
    /*
        Represent the execution of a function.

        .lines = lines outputted
            Each line has a line number & state change.
            A list of lines denotes multiple state changes occuring on the same line.
            A line group denotes lines that are repeated multiple times per execution.
    */
    public method: aFunction;
    public nthCall: number;
    public callId: string;
    public lines: MainLines;
    public activeLoopsStack: Stack<LoopLines>;

    constructor(method: aFunction, nthCall: number) {
        this.method = method;
        this.nthCall = nthCall;
        this.callId = `${this.method.file.path}:${this.method.name}:${this.nthCall}`;
        this.lines = new MainLines();
        this.activeLoopsStack = new Stack();
    }

    private normLineNum(lineNum: number) {
        return lineNum - this.method.lineNum;
    }

    public handleLoop(rawLineNum: number, tab: number, isLoopLine: boolean) {
        const lineNum = this.normLineNum(rawLineNum);

        const currentLoop = this.activeLoopsStack.peak();
        if (currentLoop && currentLoop.notInLoop(lineNum, tab)) {
            this.activeLoopsStack.pop();
        }

        if (isLoopLine) {
            const newCurrentLoop = this.activeLoopsStack.peak();
            if (newCurrentLoop && newCurrentLoop.isInLoop(lineNum, tab)) {
                newCurrentLoop.startNewLoop();
            } else {
                const loop = new LoopLines(lineNum, tab);
                this.addLine(rawLineNum, loop);
                this.activeLoopsStack.push(loop);
            }
        }
    }

    public addLine(rawLineNum: number, line: Line | LoopLines) {
        line.lineNum = this.normLineNum(rawLineNum);
        if (this.activeLoopsStack.peak()) {
            this.activeLoopsStack.peak()!.push(line);
        } else {
            this.lines.push(line);
        }
    }
}


class MainLines {
    public lines: (LoopLines|Line)[];

    constructor() {
        this.lines = new Array();
    }

    public getLastLine(): (Line | undefined) {
        if (this.lines) {
            const lastItem = this.lines[this.lines.length-1];
            if (lastItem instanceof LoopLines) {
                return lastItem.getLastLine();
            }
            return lastItem;
        }
    }

    public addLineValue(line: Line | LoopLines) {
        let lastLine: (Line | undefined) = this.getLastLine();

        if (!(line instanceof LoopLines) && lastLine) {
            if (lastLine.onSameLine(line)) {
                lastLine.addValue(line);
                return;
            }
        }
        this.lines.push(line);
    }

    public push(line: Line | LoopLines) {
        const lastItem = this.lines[this.lines.length-1];
        if (lastItem instanceof LoopLines) {
            throw new Error('Should only add to LoopLines via Stack.');
        } else {
            this.addLineValue(line);
        }
    }
}


class LoopLines {
    public lineNum: number;
    public tab: number;
    public groups: MainLines[];

    constructor(lineNum: number, tab: number) {
        this.lineNum = lineNum;
        this.tab = tab;
        this.groups = new Array();
    }

    public getLastLine(): (Line | undefined) {
        if (this.groups) {
            return this.groups[this.groups.length-1].getLastLine();
        }
    }

    public startNewLoop() {
        this.groups.push(new MainLines());
    }

    public push(line: Line | LoopLines) {
        let lastGroup = this.groups[this.groups.length-1];
        lastGroup.push(line);
    }

    public notInLoop(lineNum: number, tab: number) {
        return tab < this.tab || tab === this.tab && lineNum !== this.lineNum;
    }

    public isInLoop(lineNum: number, tab: number) {
        return !this.notInLoop(lineNum, tab);
    }
}


class Line {
    /*
        Represents a value line (starts with ... in snoops).
    */
    public lineNum: number;
    public value: string[];

    constructor(value: string) {
        this.lineNum = -1;
        this.value = [value];
    }

    public onSameLine(line: Line) {
        return line.lineNum === this.lineNum;
    }

    public addValue(line: Line) {
        this.value.push(line.value[0]);
    }
}


class StateLine extends Line {}

class StdOutLine extends Line {}

class ErrorLine extends Line {}


class FunctionLink extends Line {
    /*
        Gives a link to another function call.
    */
    public callId: string;

    constructor(callId: string, value: string) {
        super(value);
        this.callId = callId;
    }
}

class ErrorReturnLine extends FunctionLink {}


export {
    AllFiles, File, aFunction, ExecutedFunction, Line, LoopLines, StateLine, StdOutLine, ErrorLine, FunctionLink, ErrorReturnLine
};
