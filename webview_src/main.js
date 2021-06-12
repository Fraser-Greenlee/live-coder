
///////////// Main

var mousedownPosition;
var setMarginTop = false;
var lastScrolledWebview = 0;
var lastScrolledEditor = 0;

(function () {
    const vscode = acquireVsCodeApi();

    handleMessagesFromExtension();
    handleScrolling(vscode);
    handleTestPicker(vscode);
    handleTestPanelResizer(vscode);
    handleToolTip();
    handleFunctionCallLinks(vscode);
    handlefunctionCallButtons(vscode);
}());

///////////// Setup Functions

function handleMessagesFromExtension() {
    window.addEventListener('message', event => {
        const message = event.data;
        if (message.command === 'editorScroll') {
            editorScrollMessage(message.scroll);
        } else {
            console.log('Error, got unknown message:', message.command);
        }
    });
}

function _throttle(func, wait) {
    var time = Date.now();
    return function() {
      if ((time + wait - Date.now()) < 0) {
        func();
        time = Date.now();
      }
    };
}

function handleTestPicker(vscode) {
    document.getElementById('testPicker').addEventListener(
        'change',
        function() {
            pickedTestMethod(vscode);
        },
        false
     );
}

function handleTestPanelResizer(vscode) {
    var testPanelResizer = document.getElementById("testPanelResizer");
    if (testPanelResizer !== null) {
        addTestPanelListeners(vscode);
    }
}

function handleToolTip() {
    var snippets = document.getElementsByClassName('highlight');
    for (let i = 0; i < snippets.length; i++) {
        const snippetDiv = snippets[i];
        if (snippetDiv.id === 'tooltip') {
            continue;
        }
        snippetDiv.addEventListener("click", function(event) {
            showToolTip(event.currentTarget);
        });
    }
    var tooltipBackground = document.getElementById('tooltipBackground');
    tooltipBackground.addEventListener("click", function() { hideToolTip(); });
}

function handleFunctionCallLinks(vscode) {
    var links = document.getElementsByClassName('function_call_link');
    for (let i = 0; i < links.length; i++) {
        links[i].addEventListener(
            'click',
            function(event) {
                openFunctionCall(vscode, event);
            }
        );
    }
}

function handlefunctionCallButtons(vscode) {
    var buttons = document.getElementsByClassName('functionCallButton');
    for (let i = 0; i < buttons.length; i++) {
        var button = buttons[i];
        if (button.classList.contains('disabled')) {
            continue;
        }
        if (button.classList.contains('previous')) {
            button.addEventListener(
                'click',
                function(event) {
                    previousFunction(vscode, event.currentTarget);
                }
            );
        } else {
            button.addEventListener(
                'click',
                function(event) {
                    nextFunction(vscode, event.currentTarget);
                }
            );
        }
    }
}

///////////// Scrolling

function _notScrollingEditor() {
    return (Date.now() - lastScrolledEditor) > 50;
}

function editorScrollMessage(scroll) {
    var liveValues = document.getElementById('scrollableLiveValues');
    _modScroll(scroll - liveValues.scrollTop);
    lastScrolledEditor = Date.now();
    _setMarginTop(scroll);
}

function _setMarginTop(scroll) {
    var liveValues = document.getElementById('scrollableLiveValues');
    if (scroll <= 2) {
        if (setMarginTop === false) {
            liveValues.style.marginTop = '23px';
            setMarginTop = true;
        }
    } else if (setMarginTop) {
        liveValues.style.marginTop = '';
        setMarginTop = false;
    }
}

function _scrollLineNumber(scroll) {
    return Math.floor(scroll/18);
}

function handleScrolling(vscode) {
    var liveValues = document.getElementById('scrollableLiveValues');
    liveValues.addEventListener(
        'scroll',
        _throttle(() => {
            if (_notScrollingEditor()) {
                lastScrolledWebview = Date.now();
                vscode.postMessage({command: 'revealLine', line: _scrollLineNumber(liveValues.scrollTop)});
                _setMarginTop(liveValues.scrollTop);
            }
        }, 10)
    );
}

///////////// Test Panel

function disableSelect(event) {
    event.preventDefault();
}

function _removeResizerListeners() {
    document.removeEventListener("mousemove", resizeTestOutput, false);
    window.removeEventListener('selectstart', disableSelect);
}

function _addTestHeaderListener(vscode) {
    var testHeader = document.getElementById('testHeader');
    testHeader.addEventListener(
        "click",
        function() {
            toggleTestHeader(vscode);
        },
        false
    );
}

function _testPanelOpen() {
    return document.getElementById("testPanelResizer").className !== 'closed';
}

function addTestPanelListeners(vscode) {
    document.addEventListener("mouseup", _removeResizerListeners, false);
    document.addEventListener("mouseleave", _removeResizerListeners, false);
    _addTestHeaderListener(vscode);
    if (_testPanelOpen()) {
        _startPanelResizer();
    }
}

function _resizePanel(event) {
    mousedownPosition = event.y;
    document.addEventListener("mousemove", resizeTestOutput, false);
    window.addEventListener('selectstart', disableSelect);
}

function _startPanelResizer() {
    var testPanelResizer = document.getElementById("testPanelResizer");
    testPanelResizer.addEventListener("mousedown", _resizePanel);
}

function _openTestHeader() {
    document.getElementById('resize').className = 'open';
    document.getElementById('testOuptutArrow').innerHTML = '&#8600;';
    _startPanelResizer();
}

function _closeTestHeader() {
    resize.className = 'closed';
    testOuptutArrow.innerHTML = '&#8594;';
    _stopPanelResizer();
}

function _stopPanelResizer() {
    var testPanelResizer = document.getElementById("testPanelResizer");
    testPanelResizer.removeEventListener("mousedown", _resizePanel);
}

function toggleTestHeader(vscode) {
    if (resize.className === 'closed') {
        _openTestHeader();
        vscode.postMessage({command: 'toggleTestOutput', value: 'open'});
    } else {
        _closeTestHeader();
        vscode.postMessage({command: 'toggleTestOutput', value: 'close'});
    }
}

function _testBodyHeight() {
    var testBody = document.getElementById('testBody');
    var height = parseInt(testBody.style.height);
    if (isNaN(height)) {
        return 100;
    }
    return height;
}

function resizeTestOutput(e) {
    const heightDiff = mousedownPosition - e.y;
    const newHeight = _testBodyHeight() + heightDiff;
    if (newHeight >= 100) {
        testBody.style.height = newHeight + "px";
        mousedownPosition = e.y;
    }
}

///////////// ToolTip

function styleToolTip(tooltip, highlightDiv) {
    var rect = highlightDiv.getBoundingClientRect();
    tooltip.style.top = parseInt(rect.top) + 'px';
    tooltip.style.left = '40px';
    tooltip.style.width = `calc(100vw - 40px - 50px)`;
    tooltip.style.display = 'block';
}

function styleToolTipBackground() {
    var liveValues = document.getElementById('scrollableLiveValues');
    var background = document.getElementById('tooltipBackground');
    background.style.width = liveValues.scrollWidth + 'px';
    background.style.height = liveValues.scrollHeight + 'px';
}

function showToolTip(highlightDiv) {
    var tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = highlightDiv.innerHTML;
    styleToolTip(tooltip, highlightDiv);
    styleToolTipBackground();
    var tooltipBackground = document.getElementById('tooltipBackground');
    tooltipBackground.className = 'show';
}

function hideToolTip() {
    var tooltip = document.getElementById('tooltip');
    tooltip.innerHTML = '';
    tooltip.style.top = '-30px';
    var background = document.getElementById('tooltipBackground');
    background.className = '';
    background.style.width = '';
    background.style.height = '';
}

///////////// TestPickers

function pickedTestMethod(vscode) {
    if (_pickedNull('testPicker')) {
        vscode.postMessage({command: 'clearLiveValues'});
    } else {
        _messageRunTestMethod(vscode);
    }
}

function _pickedNull(selectId) {
    return document.getElementById(selectId).value === "";
}

function _messageRunTestMethod(vscode) {
    const methodPicker = document.getElementById("testPicker");
    const valueType = methodPicker.options[methodPicker.selectedIndex].getAttribute("data-field_type");
    console.log('_messageRunTestMethod', {command: 'selectLogsOrTest', method: methodPicker.value, valueType: valueType});
    vscode.postMessage({
        command: 'selectLogsOrTest',
        method: methodPicker.value,
        valueType: valueType
    });
}

///////////// Function Call Selector

function _findCurrentSelection(functionCalls) {
    for (let index = 0; index < functionCalls.length; index++) {
        const call = functionCalls[index];
        if (!(call.classList.contains('hide'))) {
            return index;
        }
    }
    return 0;
}

function _setSelection(vscode, functionCalls, selectedIndex) {
    for (let i = 0; i < functionCalls.length; i++) {
        const call = functionCalls[i];
        if (i === selectedIndex) {
            if (call.classList.contains('hide')) {
                call.classList.remove("hide");
            }
            const [name, callId] = _callData(call);
            console.log('postMessage', {command: 'updateFunctionCallSelection', callId: callId});
            vscode.postMessage({command: 'updateFunctionCallSelection', callId: callId});
        } else {
            if (!(call.classList.contains('hide'))) {
                call.classList.add("hide");
            }
        }
    }
}

function _inc(num, max) {
    num++;
    if (num >= max) {
        return 0;
    }
    return num;
}

function nextFunction(vscode, node) {
    const functionName = node.dataset.functionname;
    var functionCalls = document.getElementsByClassName("functionName_" + functionName);
    var selection = _findCurrentSelection(functionCalls);
    selection = _inc(selection, functionCalls.length);
    _setSelection(vscode, functionCalls, selection);
}

function _dec(num, max) {
    num--;
    if (num < 0) {
        return max - 1;
    }
    return num;
}

function previousFunction(vscode, node) {
    const functionName = node.dataset.functionname;
    var functionCalls = document.getElementsByClassName("functionName_" + functionName);
    var selection = _findCurrentSelection(functionCalls);
    selection = _dec(selection, functionCalls.length);
    _setSelection(vscode, functionCalls, selection);
}


///////////// Function Call Links

function _callData(element) {
    return [element.dataset.referenceName, element.dataset.referenceId];
}

function _selectFunctionCall(callId, functionName, functionCalls) {
    for (let i = 0; i < functionCalls.length; i++) {
        if (functionCalls[i].id === "FunctionCall_" + callId) {
            return i;
        }
    }
    throw new Error(`Missing function call "${callId}" for function "${functionName}"`);
}

function _tooHigh(rect) {
    return rect.top < 100;
}

function _cantSee(rect) {
    return _tooHigh(rect) || rect.bottom > window.innerHeight - 100;
}

function _modScroll(mod) {
    document.getElementById('scrollableLiveValues').scrollTop = document.getElementById('scrollableLiveValues').scrollTop + mod;
}

function _scrollToFunction(node) {
    const rect = node.getBoundingClientRect();
    if (_cantSee(rect)) {
        if (_tooHigh(rect)) {
            _modScroll(- 100 + rect.top);
        } else {
            _modScroll(rect.bottom - window.innerHeight + 100);
        }
    }
}

function openFunctionCall(vscode, event) {
    console.log("openFunctionCall");
    const [name, callId] = _callData(event.currentTarget);
    const functionCalls = document.getElementsByClassName("functionName_" + name);
    if (functionCalls.length > 0) {
        _viewFunctionCall(vscode, callId, name, functionCalls);
    } else {
        vscode.postMessage({command: 'openFunctionCall', callId: callId, name: name});
    }
}

function _viewFunctionCall(vscode, callId, name, functionCalls) {
    const selection = _selectFunctionCall(callId, name, functionCalls);
    _setSelection(vscode, functionCalls, selection);
    _scrollToFunction(functionCalls[selection]);
}
