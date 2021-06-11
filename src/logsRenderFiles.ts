
function hideFunctionCall(selectedCallId: string, callId: string) {
    if (selectedCallId !== callId) {
        return 'hide';
    }
    return '';
}

function htmlForFunctionCall(functionName: string, callId: string, html: string, selectedCallId: string) {
    const hide: string = hideFunctionCall(selectedCallId, callId);
    return `<div class="functionCall ${hide} functionName_${functionName}" id="FunctionCall_${callId}" data-reference-id="${callId}" data-reference-name="${functionName}">${html}</div>`;
}

function disabledCallSelector(numberOfCalls: number) {
    if (numberOfCalls > 1) {
        return '';
    }
    return 'disabled';
}

function functionButtons(functionName: string, calls: {[callId: string]: string}) {
    const disabled: string = disabledCallSelector(Object.keys(calls).length);
    let buttons: string = `<button class="functionCallButton previous ${disabled}" data-functionName="${functionName}">&lt;</button>`;
    buttons += `<button class="functionCallButton next ${disabled}" data-functionName="${functionName}">&gt;</button>`;
    return buttons;
}

function functionCallIds(calls: any) {
    let callIds: string[] = [];
    Object.keys(calls).forEach(callId => {
        callIds.push(`functionCall${callId}`);
    });
    return callIds.join(' ');
}

function htmlForAFunction(
    functionInfo: {
        startingLineNumber: number
        calls: {[callId: string]: string}
    },
    selectedCallId: string,
    functionName: string
) {
    let functionCallsHTML: string[] = new Array();
    Object.keys(functionInfo.calls).forEach(callId => {
        functionCallsHTML.push(
            htmlForFunctionCall(functionName, callId, functionInfo.calls[callId], selectedCallId)
        );
    });
    const callIds: string = functionCallIds(functionInfo.calls);
    const buttons: string = functionButtons(functionName, functionInfo.calls);
    return `<div class="function" id="${callIds}" style="top: ${(functionInfo.startingLineNumber - 2) * 18}px">${buttons}${functionCallsHTML.join('')}</div>`;
}

function htmlForFunctions(
    functionsToCalls: {
        [func: string]: {
            startingLineNumber: number
            calls: {[callId: string]: string}
        }
    },
    selectedCallIds: {[func: string]: string}
) {
    let hmlFunctions: string[] = new Array();
    Object.keys(functionsToCalls).forEach(functionName => {
        hmlFunctions.push(
            htmlForAFunction(functionsToCalls[functionName], selectedCallIds[functionName], functionName)
        );
    });
    return hmlFunctions.join('');
}

export function renderFiles(
    funcCallRender: { [path: string]: {
        [func: string]: {
            startingLineNumber: number
            calls: {[callId: string]: string}
        }
    } },
    selectedCallIds: { [path: string]: {
        [func: string]: string
    } }
) {
    let pathsToHTML: {[path: string]: string} = {};
    for (const path in funcCallRender) {
        pathsToHTML[path] = htmlForFunctions(funcCallRender[path], selectedCallIds[path]);
    }
    return pathsToHTML;
}