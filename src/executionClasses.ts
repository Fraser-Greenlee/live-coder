
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

    public getExec({i = null}: {i?: number | null }) {
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
    public lines: (LineGroup|Line|Line[])[];
    public groupsStack: any[];

    constructor(method: aFunction, nthCall: number) {
        this.method = method;
        this.nthCall = nthCall;
        this.callId = `${this.method.file.path}:${this.method.name}:${this.nthCall}`;
        this.lines = new Array();
        this.groupsStack = new Array();
    }

    private normLineNum(lineNum: number) {
        return lineNum - this.method.lineNum;
    }

    public handleGroup(lineNum: number, tab: number, isGroupLine: boolean) {
        lineNum = this.normLineNum(lineNum);

        // exit groups
        while (this.groupsStack && this.groupsStack.slice(-1)[0] && tab < this.groupsStack.slice(-1)[0].tab) {
            this.groupsStack.pop();
        }

        if (this.groupsStack && this.groupsStack.slice(-1)[0] && tab === this.groupsStack.slice(-1)[0].tab && lineNum !== this.groupsStack.slice(-1)[0].line_num) {
            this.groupsStack.pop();
        }

        // add a group
        if (isGroupLine) {
            if (this.groupsStack && this.groupsStack.slice(-1)[0] && lineNum === this.groupsStack.slice(-1)[0].line_num) {
                this.groupsStack.slice(-1)[0].start_new_group();
            } else {
                const group = new LineGroup(lineNum, tab);
                this.groupsStack.push(group);
                this.lines.push(group);
            }
        }
    }

    private getLastLine() {
        if (this.groupsStack && this.groupsStack.slice(-1)[0]) {
            return this.groupsStack.slice(-1)[0].getLastLine();
        }
        if (this.lines) {
            return this.lines.slice(-1)[0];
        }
    }

    private appendLine(line: Line) {
        if (this.groupsStack && this.groupsStack.slice(-1)[0]) {
            this.groupsStack.slice(-1)[0].addLine(line);
        } else {
            this.lines.push(line);
        }
    }

    private setLastLine(line: (Line|Line[])) {
        if (this.groupsStack && this.groupsStack.slice(-1)[0]) {
            this.groupsStack.slice(-1)[0].setLastLine(line);
        } else if (this.lines) {
            this.lines[this.lines.length-1] = line;
        }
    }

    private _addLine(lineNum: number, line: (FunctionLink | Line)) {
        let lastLine: (Line| Line[]) = this.getLastLine();

        if (lastLine) {

            let lastLineNum: number;
            if (Array.isArray(lastLine)) {
                lastLineNum = lastLine[0].lineNum;
            } else {
                lastLineNum = lastLine.lineNum;
            }

            if (lastLineNum === lineNum) {
                if (Array.isArray(lastLine)) {
                    lastLine.push(line);
                } else {
                    lastLine = [lastLine, line];
                }
                this.setLastLine(lastLine);
                return;
            }
        }

        this.appendLine(line);
    }

    public addLine(lineNum: number, value: string, callId: string | null, isReturn: boolean | null) {
        lineNum = this.normLineNum(lineNum);

        let line: (FunctionLink | Line);
        if (callId) {
            line = new FunctionLink(callId, lineNum, value);
        } else {
            line = new Line(lineNum, value);
        }

        this._addLine(lineNum, line);
    }
}


class LineGroup {
    /*
        Holds lines for one run of a loop.
    */
    public lineNum: number;
    public tab: number;
    public groups: (LineGroup|Line)[][];

    constructor(lineNum: number, tab: number) {
        this.lineNum = lineNum;
        this.tab = tab;
        this.groups = new Array();
        this.groups.push(new Array());
    }

    public addLine(line: Line) {
        this.groups.slice(-1)[0].push(line);
    }

    public startNewGroup() {
        this.groups.push([]);
    }

    public getLastLine() {
        if (this.groups && this.groups.slice(-1)[0]) {
            return this.groups.slice(-1)[0].slice(-1)[0];
        }
    }

    public setLastLine(line: Line) {
        if (this.groups && this.groups.slice(-1)[0]) {
            this.groups[this.groups.length-1][this.groups.length-1] = line;
        } else {
            throw new Error('No line to set.');
        }
    }
}


class Line {
    /*
        Represents a value line (starts with ... in snoops).
    */
    public lineNum: number;
    public value: string;

    constructor(lineNum: number, value: string) {
        this.lineNum = lineNum;
        this.value = value;
    }
}


class FunctionLink extends Line {
    /*
        Gives a link to another function call.
    */
    public callId: string;

    constructor(callId: string, lineNum: number, value: string) {
        super(lineNum, value);
        this.callId = callId;
    }
}

export {
    AllFiles, File, aFunction, ExecutedFunction, LineGroup, Line, FunctionLink
};
