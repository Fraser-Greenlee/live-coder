import { encode } from "he";
import { maxLoopSteps } from "./config";
import { AllFiles, File, ExecutedFunction, LineGroup, Line, FunctionLink } from "./executionClasses";


function renderJustOneLine(line: Line) {
    let extraClass = '';
    let extraData = '';
    if (line instanceof FunctionLink) {
        extraClass = 'function_call_link';
        extraData = ` data-reference-id="${line.callId}"`;
    }

    return `<span class="${extraClass}"${extraData}>${encode(line.value)}</span>`;
}


function renderLine(line: Line | Line[], prevLineNum: number) {
    let lineNum: number;
    let val: string;

    if (Array.isArray(line)) {
        lineNum = line[0].lineNum;
        let vals = new Array();
        for (let lne of line) {
            vals.push(renderJustOneLine(lne));
        }
        val = vals.join(', ');
    } else {
        lineNum = line.lineNum;
        val = renderJustOneLine(line);
    }

    return {
        lineHTML: `<div style="height:18px;margin-top:${18*(lineNum - prevLineNum)}px" class="view-line" data-line_num="${lineNum}">${val}</div>`,
        lastLineNum: lineNum
    };
}



function renderLineGroup(group: LineGroup, prevLineNum: number) {
    let htmlIterations: string[] = new Array();
    for (let groupLines of group.groups) {

        let renderedLines: string[] = new Array();
        for (let line of groupLines) {
            const {lineHTML, lastLineNum} = renderAnyLine(line, prevLineNum);
            prevLineNum = lastLineNum;
            renderedLines.push(lineHTML);
        }

        htmlIterations.push(
            `<div class="iteration">${renderedLines.join('')}</div>`
        );
    }
    return {
        lineHTML: `<div class="loop">${htmlIterations.slice(0, maxLoopSteps).join('')}</div>`,
        lastLineNum: prevLineNum
    };
}


function renderAnyLine(line: LineGroup | Line | Line[], prevLineNum: number) {
    if (line instanceof LineGroup) {
        return renderLineGroup(line, prevLineNum);
    }
    return renderLine(line, prevLineNum);
}


function renderCall(call: ExecutedFunction) {
    if (call.callId === '/Users/Fraser/projects/active/basic-python/basic/main.py:fizzbuzz:0') {
        const z = 1;
    }
    let html = '';
    let prevLineNum = 0;
    for (let line of call.lines) {
        const {lineHTML, lastLineNum} = renderAnyLine(line, prevLineNum);
        html += lineHTML;
        prevLineNum = lastLineNum;
    }
    return html;
}


function renderFile(file: File) {
    let result: { [name: string]: any } = {};
    for (let [name, method] of Object.entries(file.methods)) {
        let calls: { [callId: string]: any } = {};
        for (let exec of method.executions) {
            calls[exec.callId] = renderCall(exec);
        }
        result[name] = {
            'startingLineNumber': method.lineNum,
            'calls': calls
        };
    }
    return result;
}

function renderFunctionCalls(parse: AllFiles) {
    /*
        Convert AllFiles object into dict to send to LiveCoder extension.

        return format:
            {
                'src/main.py': {
                    'method_name': {
                        'startingLineNumber': 4,
                        'calls': {
                            `call id`: `function HTML`,
                            `call id`: `function HTML`
                        }
                    }
                }
            }
    */
    let result: { [path: string]: {
        [func: string]: {
            startingLineNumber: number
            calls: {[callId: string]: string}
        }
    } } = {};
    for (let [path, file] of Object.entries(parse.files)) {
        result[path] = renderFile(file);
    }
    return result;
}


export function renderCalls(parse: AllFiles) {
    const funcCallRender: {
        [path: string]: {
            [func: string]: {
                startingLineNumber: number
                calls: {[callId: string]: string}
            }
        }
    } = renderFunctionCalls(parse);
    return funcCallRender;
}
