import * as vscode from "vscode";
import { ChildProcess, spawn } from 'child_process';
import { getNonce } from "./getNonce";
import { requestLiveValues } from "./test/getLiveValues";

export class LiveValuesPanel {
	/**
	 * Track the currently panel. Only allow a single panel to exist at a time.
	 */
	public static currentPanel: LiveValuesPanel | undefined;

	public static readonly viewType = 'liveValues';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

	private _currentActiveTextEditor: vscode.TextEditor;

	private _projectRoot: string = '';
	public testsRelativePath: string = '';
	public testPattern: string = '';

	private _testClasses: any;
	private _selectedTestClassIndex: number = -1;
	private _selectedtestMethodIndex: number = -1;

	private _liveValues: any = {};
	private _callIdToFunction: any = {};
	private _selectedFunctionCallIds: any = {};
	private _testOutput: string[] = new Array();
	private _currentTestId: string = "";
	private _testOutputIsClosed: boolean = true;
	public webviewLastScrolled: number = Date.now();


	public static createOrShow(extensionUri: vscode.Uri) {
        const column: number = vscode.ViewColumn.Beside;

		// If we already have a panel, show it.
		if (LiveValuesPanel.currentPanel) {
			LiveValuesPanel.currentPanel._panel.reveal(column);
			LiveValuesPanel.currentPanel._update();
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
            LiveValuesPanel.viewType,
            'Live Coder',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                // Maintain UI even when in background
                retainContextWhenHidden: true,
                // Restrict the webview to only loading content from our extension's `webview_src` directory.
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, "webview_src"),    
                ]
            }
        );
		LiveValuesPanel.currentPanel = new LiveValuesPanel(panel, extensionUri);
	}

	public static kill() {
		LiveValuesPanel.currentPanel?.dispose();
		LiveValuesPanel.currentPanel = undefined;
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		LiveValuesPanel.currentPanel = new LiveValuesPanel(panel, extensionUri);
	}

	private static _isPython(activeTextEditor: vscode.TextEditor) {
		const fileName: string = activeTextEditor.document.fileName;
		const potentialPy: string = fileName.substr(fileName.length - 3);
		return potentialPy === '.py';
	}

	private _isNewActiveEditor(activeEditor: vscode.TextEditor) {
		return activeEditor.document.fileName !== this._currentActiveTextEditor.document.fileName;
	}

	private _getTestSettings() {
		const pyTestArgs = vscode.workspace.getConfiguration('python.testing.unittestArgs');
		let i: number = 0;
		while ( pyTestArgs.has(String(i)) ) {
			let arg: string|undefined = pyTestArgs.get(String(i));
			if (arg && arg[0] !== '-') {
				if (arg.substr(arg.length - 3, 3) === '.py') {
					this.testPattern = arg;
				} else {
					this.testsRelativePath = arg;
				}
			}
			i++;
		}
	}

	public static badSettingsError() {
		if (vscode.workspace.getConfiguration('python').get('pythonPath')) {
			vscode.window.showErrorMessage('Please select a Python interpreter. Do this with the "Python: Select Interpreter" command.');
			return true;
		}
		if (vscode.workspace.getConfiguration('python.testing').get('unittestEnabled') === false) {
			vscode.window.showErrorMessage('Please enable unittests in your settings. Do this with the "Python: Configure Tests" command.');
			return true;
		}
		return false;
	}

	private _getLines(text: string) {
		const lines = text.split('\n');
		return '<span>' + lines.join('</span><span>') + '</span>';
	}

	private _scrollToLine(line: number) {
		this.webviewLastScrolled = Date.now();
		const range = new vscode.Range(line, 0, line + 1, 0);
		this._currentActiveTextEditor.revealRange(
			range, vscode.TextEditorRevealType.AtTop
		);
	}

	private _runTestMethod(classIndex: number, methodIndex: number, method: string) {
		this._currentTestId = method;
		let response = this._getLiveValues();
		response.then((liveValuesAndTestOutput) => {
			if (liveValuesAndTestOutput === undefined) {
				this._panel.webview.html = this._errorHTML(
					'<b>Error</b> Got no response from the server, is it running?'
				);
			} else {
				this._selectedTestClassIndex = classIndex;
				this._selectedtestMethodIndex = methodIndex;
				this._panel.webview.html = this._liveValuesHTML(
					liveValuesAndTestOutput[0],
					liveValuesAndTestOutput[1]
				);
			}
		});
	}

	private _selectNoTestClass() {
		this._selectedTestClassIndex = -1;
		this._selectedtestMethodIndex = -1;
		this._currentTestId = "";
		this._panel.webview.html = this._errorHTML(
			'<b>No Test Class or Test Method Selected</b> Use the dropdown above to see your code run!'
		);
	}

	private _handleWebviewMessages() {
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'revealLine':
                    	this._scrollToLine(message.line);
						return;
					case 'clearLiveValues':
						this._selectNoTestClass();
						return;
					case 'runTestMethod':
						return;
					case 'toggleTestOutput':
						this._testOutputIsClosed = this._testOutputIsClosed === false;
					case 'openFunctionCall':
						this._openFunctionCall(message.callId, message.name);
					case 'updateFunctionCallSelection':
						this._updateFunctionCallSelection(message.callId, message.name);
				}
			},
			null,
			this._disposables
		);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._currentActiveTextEditor = vscode.window.activeTextEditor!;

        // Set the webview's initial html content
        this._update();

		// Listen for when _panel is disposed
		// This happens when the user closes the panel or when the panel is closed programatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._handleWebviewMessages();
	}

    private async _update() {
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, "<h1>Test</h1>");
    }

	public scrollWebview(yPosition: number) {
		this._panel.webview.postMessage({ command: 'editorScroll', scroll: yPosition });
	}

	public dispose() {
		LiveValuesPanel.currentPanel = undefined;

        this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
	
	private _updateFileAttributes() {
		if (vscode.window.activeTextEditor) {
			this._currentActiveTextEditor = vscode.window.activeTextEditor;
		}
		this._panel.title = `Live Coder: ` + this._currentFileNameShort();
	}

	private _updatePanelDisplay(reloadValues: boolean) {
		let response;
		if (reloadValues) {
			response = this._getLiveValues();
		} else {
			response = new Promise((resolve, reject) => {
				resolve(this._getLiveValuesForCurrentEditor());
			});
		}
		response.then((liveValuesAndTestOutput: any) => {
			if (liveValuesAndTestOutput === undefined) {
				this._panel.webview.html = this._errorHTML('<b>Error</b> No live values found.');
			} else {
				this._panel.webview.html = this._liveValuesHTML(
					liveValuesAndTestOutput[0],
					liveValuesAndTestOutput[1]
				);
			}
			this.scrollPanel(this._currentActiveTextEditor);
		});
	}

    private scrollPanel(textEditor: vscode.TextEditor) {
        const line = this.getScrollPosition(textEditor);
        if (typeof line === 'number' && LiveValuesPanel.currentPanel) {
            LiveValuesPanel.currentPanel.scrollWebview(line);
        }
    }

    private getScrollPosition(editor: vscode.TextEditor): number | undefined {
        if (!editor.visibleRanges.length) {
            return undefined;
        }
    
        const firstVisiblePosition = editor.visibleRanges[0].start;
        const lineNumber = firstVisiblePosition.line;
        const line = editor.document.lineAt(lineNumber);
        const progress = firstVisiblePosition.character / (line.text.length + 2);
        return (lineNumber + progress) * 18;
    }

	public updateWebview(reloadValues: boolean) {
		this._updateFileAttributes();
		this._updatePanelDisplay(reloadValues);
	}

	private _liveValuesHTML(liveValues: string, testOutput: string) {

		const testClassOptions: string = this._getTestClassOptions();
		const testMethodOptions: string = this._getTestMethodOptions();

		return this._getHtmlForWebview(
            this._panel.webview,
            `<div id="header">
				<select class="picker" id="testClassPicker">
					<option value="">No Test Class</option>
					<option value="─────────" disabled="">─────────</option>
					${testClassOptions}
				</select>
				<select class="picker" id="testMethodPicker">
					${testMethodOptions}
				</select>
				<a id="issueLink" href="https://gitlab.com/Fraser-Greenlee/live-coder-vscode-extension/issues/new">report an issue</a>
			</div>
			<div id="scrollableLiveValues">
				${liveValues}
				<div id="tooltipBackground"></div>
			</div>
			${testOutput}`
		);
	}
    private _errorHTML(message: string) {
		return this._getHtmlForWebview(
            this._panel.webview,
            `<div id="scrollableLiveValues">
				<div class="centre"><span>
					${message}
				</span></div>
			</div>`
        );
	}

	private _getHtmlForWebview(webview: vscode.Webview, body: string) {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "webview_src", "main.js")
        );

        const stylesResetUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "webview_src", "reset.css")
        );
        const stylesVscodeUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "webview_src", "vscode.css")
        );
        const stylesMainUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "webview_src", "main.css")
        );

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <!--
                    Use a content security policy to only allow loading images from https or from our extension directory,
                    and only allow scripts that have a specific nonce.
                -->
                <meta http-equiv="Content-Security-Policy" content="img-src https: data:; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${stylesVscodeUri}" rel="stylesheet">
                <link href="${stylesResetUri}" rel="stylesheet">
                <link href="${stylesMainUri}" rel="stylesheet">
            </head>
            <body>
                ${body}
                <div class="highlight" id="tooltip"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
	}

	private _testClassNameFromId(testClassId: string) {
		const idParts: string[] = testClassId.split('.');
		return idParts[idParts.length - 1];
	}

	private _testFileNameFromId(testClassId: string) {
		const idParts: string[] = testClassId.split('.');
		return idParts.slice(1, idParts.length - 1).join('/') + '.py';
	}

	private _testClassNames() {
		let names: string[] = new Array(this._testClasses.length);
		for (let i = 0; i < this._testClasses.length; i++) {
			const testClass = this._testClasses[i];
			names[i] = this._testClassNameFromId(testClass.id);
		}
		return this._handleDuplicateClassNames(names);
	}

	private _appendFilePathToDuplicateTestClassNames(names: string[], duplicateIndices: number[]) {
		for (let i = 0; i < duplicateIndices.length; i++) {
			const classIndex: number = duplicateIndices[i];
			const testClass = this._testClasses[i];
			names[classIndex] = `${this._testClassNameFromId(testClass.id)} ---- ${this._testFileNameFromId(testClass.id)}`;
		}
		return names;
	}

    private getDuplicates(array: string[]) {
        var duplicates = new Map<string, number[]>();
        for (var i = 0; i < array.length; i++) {
            if (duplicates.has(array[i])) {
                duplicates.get(array[i])!.push(i);
            } else if (array.lastIndexOf(array[i]) !== i) {
                duplicates.set(array[i], [i]);
            }
        }
        return duplicates;
    }

	private _handleDuplicateClassNames(names: string[]) {
		let duplicateNameToIndices: Map<string, number[]> = this.getDuplicates(names);
		if (duplicateNameToIndices.size > 0) {
			const duplicateNames: string[] = Array.from(duplicateNameToIndices.keys());
			for (let i = 0; i < duplicateNames.length; i++) {
				const duplicateName: string = duplicateNames[i];
				const duplicateIndices: number[] = duplicateNameToIndices.get(duplicateName)!;
				names = this._appendFilePathToDuplicateTestClassNames(names, duplicateIndices);
			}
		}
		return names;
	}

	private _selectedProperty(selectedIndex: number, i: number) {
		if (i === selectedIndex) {
			return 'selected';
		} else {
			return '';
		}
	}

	private _testClassOption(classNames: string[], classIndex: number) {
		const name = classNames[classIndex];
		const testClass = this._testClasses[classIndex];
		const selected = this._selectedProperty(this._selectedTestClassIndex, classIndex);
		return `<option value="${testClass.id}" data-method_names="${testClass.method_names}" data-method_ids="${testClass.method_ids}" ${selected}>${name}</option>`;
	}

	private _getTestClassOptions() {
		let classNames: string[] = this._testClassNames();
		let options: string[] = new Array(this._testClasses.length);
		for (let i = 0; i < classNames.length; i++) {
			options[i] = this._testClassOption(classNames, i);
		}
		return options.join('');
	}

	private _getTestMethodOptions() {
		if (this._selectedTestClassIndex === -1) {
			return '<option value="">No Test Method</option>';
		} else {
			return this._testMethodOptionsForClass(this._testClasses[this._selectedTestClassIndex]);
		}
	}

	private _testMethodOptionsForClass(testClass: any) {
		let options: string[] = new Array(testClass.method_names.length);
		for (let i = 0; i < testClass.method_names.length; i++) {
			const selected = this._selectedProperty(this._selectedtestMethodIndex, i);
			options[i] = `<option value="${testClass.method_ids[i]}" ${selected}>${testClass.method_names[i]}</option>`;
		}
		return options.join('');
	}

	private _callIdsForFile(filePath: string) {
		const selectedCallIds = this._selectedFunctionCallIds[filePath];
		if (selectedCallIds === undefined) {
			return {};
		}
		return selectedCallIds;
	}

	private _validCallId(callsToValues: any, selectedCallId: string|undefined) {
		if (selectedCallId) {
			return selectedCallId in callsToValues;
		}
		return false;
	}

	private _firstFunctionCall(callsToValues: any) {
		const calls: string[] = Object.keys(callsToValues);
		calls.sort();
		return calls[0];
	}

	private _selectedCallIdForFunction(callsToValues: any, selected: string|undefined) {
		if (!this._validCallId(callsToValues, selected)) {
			return this._firstFunctionCall(callsToValues);
		}
		return selected;
	}

	private _selectedCallIdsForFile(filePath: string) {
		const fileFunctions = this._liveValues[filePath];
		let selectedCallIds = this._callIdsForFile(filePath);
		Object.keys(fileFunctions).forEach(functionName => {
			selectedCallIds[functionName] = this._selectedCallIdForFunction(
				fileFunctions[functionName]['calls'], selectedCallIds[functionName]
			);
		});
		return selectedCallIds;
	}

	private _getSelectedFunctionCallIds() {
		Object.keys(this._liveValues).forEach(filePath => {
			this._selectedFunctionCallIds[filePath] = this._selectedCallIdsForFile(filePath);
		});
		return this._selectedFunctionCallIds;
	}

	private _liveValuesErrorMessage(title: string, body: string) {
		return new Array(
			`<div class="centre">
				<div class="widthLimiter">
					<span><b>${title}</b> ${body}</span>
					<div id="postHolder">
						<div class="post">
							<h2>Live Coder Basics</h2>
							<ul>
								<li><b>Run Tests</b>: First setup Python tests on VSCode <a href="https://code.visualstudio.com/docs/python/testing">instructions.</a></li>
								<li><b>goto links</b>: Click <span class="function_call_link sample">function_name</span> links goto where functions were called from/to.</li>
								<li><b>Click to expand</b>: Click on values to see expanded versions.</li>
							</ul>
						</div>
					</div>
				</div>
			</div>`,
			''
		);
	}

	private _noLiveValuesResponse() {
		if (this._currentTestId === "") {
			return this._liveValuesErrorMessage('No active test.', 'Select a test class and method from the dropdown above.');
		}
		if (this._currentActiveTextEditor === undefined) {
			return this._liveValuesErrorMessage('No active editor.', 'Open a Python file to see it run.');
		}
		return null;
	}

	private _liveValuesResponseError(response: any) {
		if (response.errorType === 'ExtensionError') {
			this.dispose();
		} else if (response.errorType === 'ImportError') {
			response.message = response.message;
		}
		vscode.window.showErrorMessage(response.message);
	}

	private _assignLiveValuesAttributesFromResponse(response: any) {
		this._liveValues = response.live_values;
		this._callIdToFunction = response.call_id_to_function;
		this._selectedFunctionCallIds = this._getSelectedFunctionCallIds();
		this._testOutput = response.test_output.split('\n');
		const testClasses = response.test_classes;
		this._testClasses = testClasses;
	}

	private async _getLiveValues() {
		const failResponse = this._noLiveValuesResponse();
		if (failResponse) {
			return failResponse;
		}
		const response = await requestLiveValues(this._currentTestId);
		if (response['type'] === 'error') {
			this._liveValuesResponseError(response);
		}
		this._assignLiveValuesAttributesFromResponse(response);
		return this._getLiveValuesForCurrentEditor();
	}

	private _testStatus() {
		if (this._testOutput[0] === "F") {
			return 'Failed';
		} else if (this._testOutput[0] === "E") {
			return 'Error';
		}
		return 'Passed';
	}

	private _testResizeClass() {
		if (this._testOutputIsClosed) {
			return 'closed';
		}
		return 'open';
	}

	private _testOutputArrow() {
		if (this._testOutputIsClosed) {
			return '&#8594';
		}
		return '&#8600';
	}

	private _getTestOutput() {
		const testOutputHTML: string = this._linesAsHTML(this._testOutput);
		const testStatus = this._testStatus();
		const resizeClass = this._testResizeClass();
		const arrowString = this._testOutputArrow();

		return `<div id="testPanel"><div id="resize" class="${resizeClass}">
			<div id="testPanelResizer"></div>
			<div id="testHeader">
				<span id="testOuptutArrow">${arrowString}</span><b>Test Output:</b><span id="testStatus" class="test${testStatus}">${testStatus}</span>
			</div>
			<div id="testBody">
				${testOutputHTML}
			</div>
		</div></div>`;
	}

	private _noValuesForFile() {
		return new Array(
			`<div class="centre">
				<span>
					<b>File not ran by the selected test.</b>
					<span class="function_call_link clearLink" data-reference-id="start" data-reference-name="${this._callIdToFunction.start[1]}">open test start</span>
				</span>
			</div>`,
			this._getTestOutput()
		);
	}

	private _hideFunctionCall(selectedCallId: string, callId: string) {
		if (selectedCallId !== callId) {
			return 'hide';
		}
		return '';
	}

	private _htmlForFunctionCall(functionName: string, callId: string, html: string, selectedCallId: string) {
		const hide: string = this._hideFunctionCall(selectedCallId, callId);
		return `<div class="functionCall ${hide} functionName_${functionName}" id="FunctionCall_${callId}" data-reference-id="${callId}" data-reference-name="${functionName}">${html}</div>`;
	}

	private _disabledCallSelector(numberOfCalls: number) {
		if (numberOfCalls > 1) {
			return '';
		}
		return 'disabled';
	}

	private _functionButtons(functionName: string, calls: any) {
		const disabled: string = this._disabledCallSelector(Object.keys(calls).length);
		let buttons: string = `<button class="functionCallButton previous ${disabled}" data-functionName="${functionName}">&lt;</button>`;
		buttons += `<button class="functionCallButton next ${disabled}" data-functionName="${functionName}">&gt;</button>`;
		return buttons;
	}

	private _functionCallIds(calls: any) {
		let callIds: string[] = [];
		Object.keys(calls).forEach(callId => {
			callIds.push(`functionCall${callId}`);
		});
		return callIds.join(' ');
	}

	private _htmlForAFunction(functionInfo: any, selectedCallId: string, functionName: any) {
		let functionCallsHTML: string[] = new Array();
		Object.keys(functionInfo.calls).forEach(callId => {
			functionCallsHTML.push(
				this._htmlForFunctionCall(functionName, callId, functionInfo.calls[callId], selectedCallId)
			);
		});
		const callIds: string = this._functionCallIds(functionInfo.calls);
		const buttons: string = this._functionButtons(functionName, functionInfo.calls);
		return `<div class="function" id="${callIds}" style="top: ${(functionInfo.starting_line_number - 1) * 18}px">${buttons}${functionCallsHTML.join('')}</div>`;
	}

	private _htmlForFunctions(functionsToCalls: any, selectedFunctionCallIds: any) {
		let hmlFunctions: string[] = new Array();
		Object.keys(functionsToCalls).forEach(functionName => {
			hmlFunctions.push(
				this._htmlForAFunction(functionsToCalls[functionName], selectedFunctionCallIds[functionName], functionName)
			);
		});
		return hmlFunctions.join('');
	}

    private _getLiveValuesForCurrentEditor() {
		const functionsToCalls = this._liveValues[this._currentFileName()];
		const selectedFunctionCallIds = this._selectedFunctionCallIds[this._currentFileName()];
		if (functionsToCalls === undefined) {
			return this._noValuesForFile();
		}
	
		let functionsHTML: string = this._htmlForFunctions(functionsToCalls, selectedFunctionCallIds);
		const testOutputHTML: string = this._getTestOutput();

		let lineCount = this._currentActiveTextEditor.document.lineCount + 100;
        return new Array(
			`<div class="padding" style="padding-bottom: ${lineCount * 18}px" onclick="console.log('clicked padding')"></div>${functionsHTML}`,
			testOutputHTML
		);
    }

    private _linesAsHTML(linesContent: string[]) {
        var htmlLines = new Array(linesContent.length);
        for (let i = 0; i < linesContent.length; i++) {
            htmlLines[i] = `<div style="height:18px;" class="view-line"><span>${linesContent[i]}</span></div>`;
        }
        return htmlLines.join('');
	}

	private _currentFileNameShort() {
		const fullPath: string = this._currentActiveTextEditor.document.fileName;
		return fullPath.split('/').pop();
	}
	
	private _currentFileName() {
		const fullPath: string = this._currentActiveTextEditor.document.fileName;
		const projectRootTerms = vscode.workspace.workspaceFolders![0].name;
		const pathTerms = fullPath.split('/');
		const localPathTerms = pathTerms.slice(projectRootTerms.length);
		return localPathTerms.join('/');
	}

	private _openFunctionCall(callId: string, name: string) {
		const path = `${vscode.workspace.workspaceFolders![0].name}/${this._callIdToFunction[callId][0]}`;
		vscode.workspace.openTextDocument(path).then(doc => {
			vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
		}, err => {
			console.log(err);	
		});
	}

	private _updateFunctionCallSelection(callId: string, name: string) {
		this._selectedFunctionCallIds[this._currentFileName()][name] = callId;
	}

}