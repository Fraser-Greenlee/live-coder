import { AllFiles, File, ExecutedFunction, LineGroup, Line, FunctionLink } from "./executionClasses";


function renderLine(line: Line | Line[]) {
    let lineNum: number;
    let val: string;

    if (Array.isArray(line)) {
        lineNum = line[0].lineNum;
        let vals = new Array();
        for (let lne of line) {
            vals.push(`<span>${lne.value}</span>`);
        }
        val = vals.join(', ');
    } else {
        lineNum = line.lineNum;
        val = `<span>${line.value}</span>`;
    }

    let extraClass, extraData = '';
    if (line instanceof FunctionLink) {
        extraClass = ' function_call_link';
        extraData = ` data-reference-id="${line.callId}"`;
    }

    return `<div style="height:18px;" class="view-line${extraClass}" data-line_num="${lineNum}"${extraData}>${val}</div>`;
}


function renderLineGroup(group: LineGroup) {
    let htmlIterations: string[] = new Array();
    for (let groupLines of group.groups) {

        let renderedLines: string[] = new Array();
        for (let line of groupLines) {
            renderedLines.push(renderAnyLine(line));
        }

        htmlIterations.push(
            `<div class="iteration">${renderedLines.join('')}</div>`
        );
    }
    return `<div class="loop">${htmlIterations.join('')}</div>`;
}


function renderAnyLine(line: LineGroup | Line | Line[]) {
    if (line instanceof LineGroup) {
        return renderLineGroup(line);
    }
    return renderLine(line);
}


function renderCall(call: ExecutedFunction) {
    let html = '';
    for (let line of call.lines) {
        html += renderAnyLine(line);
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


function getCallsIdToFunction(
    funcCallRender: { [path: string]: {
        [func: string]: {
            startingLineNumber: number
            calls: {[callId: string]: string}
        }
    } }
) {
    let callIdToFunciton: {
        [callId: string]: {
            [pathOrFunctionName: string]: string
        }
    } = {};
    for (let path in funcCallRender) {
        for (let functionName in funcCallRender[path]) {
            for (let callId in funcCallRender[path][functionName]['calls']) {
                callIdToFunciton[callId] = {
                    'path': path,
                    'functionName': functionName
                };
            }
        }
    }
    return callIdToFunciton;
}


export function renderCalls(parse: AllFiles) {
    const funcCallRender: { [path: string]: {
        [func: string]: {
            startingLineNumber: number
            calls: {[callId: string]: string}
        }
    } } = renderFunctionCalls(parse);
    return {
        'funcCallRender': funcCallRender,
        'callIdToFunction': getCallsIdToFunction(funcCallRender),
    };
}
