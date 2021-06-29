const hljs = require('highlight.js');
import { maxLoopSteps } from "./config";
import { AllFiles, File, ExecutedFunction, Line, LoopLines, FunctionLink } from "./executionClasses";


function renderJustOneLine(line: Line) {
    let extraClass = '';
    let extraData = '';
    if (line instanceof FunctionLink) {
        extraClass = 'function_call_link';
        extraData = ` data-reference-id="${line.callId}"`;
    }
    const highlight = hljs.highlight(line.value, {language: 'python'}).value;
    return `<span class="${extraClass}"${extraData}>${highlight}</span>`;
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
        lineHTML: `<div style="height:18px;margin-top:${18*Math.max(0, lineNum - prevLineNum - 1)}px" class="view-line" data-line_num="${lineNum}">${val}</div>`,
        lastLineNum: lineNum
    };
}


function renderLineLoop(loops: LoopLines, prevLineNum: number) {
    let htmlIterations: string[] = new Array();
    let maxLineNum: number = 0;
    for (let index = 0; index < Math.min(loops.groups.length, maxLoopSteps); index++) {
        const lines = loops.groups[index];

        let renderedLines: string[] = new Array();
        for (let line of lines.lines) {
            const {lineHTML, lastLineNum} = renderAnyLine(line, prevLineNum);
            prevLineNum = lastLineNum;
            renderedLines.push(lineHTML);
            maxLineNum = Math.max(maxLineNum, prevLineNum);
        }

        htmlIterations.push(
            `<div class="iteration">${renderedLines.join('')}</div>`
        );
    }
    return {
        lineHTML: `<div class="loop">${htmlIterations.join('')}</div>`,
        lastLineNum: maxLineNum
    };
}


function renderAnyLine(line: LoopLines | Line, prevLineNum: number) {
    if (line instanceof LoopLines) {
        return renderLineLoop(line, prevLineNum);
    }
    return renderLine(line, prevLineNum);
}


function renderCall(call: ExecutedFunction) {
    if (call.callId === '/Users/Fraser/projects/active/basic-python/basic/main.py:fizzbuzz:0') {
        const z = 1;
    }
    let html = '';
    let prevLineNum = 0;
    for (let line of call.lines.lines) {
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
