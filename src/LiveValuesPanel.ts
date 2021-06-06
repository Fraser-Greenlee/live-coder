import * as vscode from "vscode";
import { getNonce } from "./getNonce";
import { LogsTracker as logsTracker } from "./logsTracker";
import { TestsTracker } from "./testsTracker";
import { TestSelect } from "./testSelect";
import { isDigit, isLetter, split } from "./utils";

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

	public testsRelativePath: string = '';
	public testPattern: string = '';

	public logsTracker: logsTracker;
	public testsTracker: TestsTracker;
	public testSelect: TestSelect;
	public selectedFunctionCallIds: any = {};

	private _testOutputIsClosed: boolean = true;
	public webviewLastScrolled: number = Date.now();

	public static createOrShow(extensionUri: vscode.Uri) {

		if (this.badSettingsError()) {
			return false;
		}

        const column: number = vscode.ViewColumn.Beside;

		// If we already have a panel, show it.
		if (LiveValuesPanel.currentPanel) {
			LiveValuesPanel.currentPanel._panel.reveal(column);
			return true;
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
		return true;
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._currentActiveTextEditor = vscode.window.activeTextEditor!;

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this.logsTracker = new logsTracker();
		this.testsTracker = new TestsTracker();
		this.testSelect = new TestSelect(this.testsTracker, this.logsTracker);
		this.testsTracker.findTestMethods().then((worked) => {
			if (worked) {
				this.refreshWebview();
			}
		});
        this._addWebviewMessageHandlers();
	}

	public static kill() {
		LiveValuesPanel.currentPanel?.dispose();
		LiveValuesPanel.currentPanel = undefined;
	}

	public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		LiveValuesPanel.currentPanel = new LiveValuesPanel(panel, extensionUri);
	}

	public isNewActiveEditor(activeEditor: vscode.TextEditor) {
		return activeEditor.document.fileName !== this._currentActiveTextEditor.document.fileName;
	}

	public static badSettingsError() {
		if (!vscode.workspace.getConfiguration('python').get('pythonPath')) {
			vscode.window.showErrorMessage('Please select a Python interpreter. Do this with the "Python: Select Interpreter" command.');
			return true;
		}
		if (vscode.workspace.getConfiguration('python.testing').get('unittestEnabled') === false) {
			vscode.window.showErrorMessage('Please enable unittest in your settings. Do this with the "Python: Configure Tests" command.');
			return true;
		}
		return false;
	}

	private _scrollToLine(line: number) {
		this.webviewLastScrolled = Date.now();
		const range = new vscode.Range(line, 0, line + 1, 0);
		this._currentActiveTextEditor.revealRange(
			range, vscode.TextEditorRevealType.AtTop
		);
	}

	private _sanitize(filename: string) {
		let parts: string[] = new Array();
		for (let c of filename) {
			if (isDigit(c) || isLetter(c) || c === ' ') {
				parts.push(c);
			}
		}
		return parts.join('');
	}

	private _methodToLogPath(method: string) {
		method = split(method, ' ').join(' ');
		return this._sanitize(method).substring(0, 255) + '.txt';
	}

	private _addWebviewMessageHandlers() {
		this._panel.webview.onDidReceiveMessage(
			message => {
				const cmd = message.command;
				if        (cmd === 'revealLine') {
					this._scrollToLine(message.line);
				} else if (cmd === 'clearLiveValues') {
					this.testsTracker.deselect();
					this.refreshWebview();
				} else if (cmd === 'selectLogsOrTest' && message.valueType === 'liveTest') {
					this.logsTracker.changeLogFile(this._methodToLogPath(message.method));
					this.testsTracker.runTest({method: message.method});
				} else if (cmd === 'selectLogsOrTest') { // not liveTest so must be log file
					this.logsTracker.changeLogFile(message.method);
					this.logsTracker.refresh();
				} else if (cmd === 'toggleTestOutput') {
					this._testOutputIsClosed = this._testOutputIsClosed === false;
				} else if (cmd === 'openFunctionCall') {
					this._openFunctionCall(message.callId);
				} else if (cmd === 'updateFunctionCallSelection') {
					this.logsTracker.selectedCallIds[message.callId.split(':')[0], message.callId.split(':')[1]] = message.callId; 
				}
			},
			null,
			this._disposables
		);
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

    public scrollPanel(textEditor: vscode.TextEditor) {
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

	public refreshWebview() {
        if (vscode.window.activeTextEditor) {
			this._currentActiveTextEditor = vscode.window.activeTextEditor;
			const fullPath: string = this._currentActiveTextEditor.document.fileName;
            this._panel.title = `Live Coder: ` + split(fullPath, '/').pop();
		}

		let content: string;
		if (this._currentActiveTextEditor === undefined) {
			content = this._liveValuesErrorMessage('No active editor.', 'Open a Python file to see it run.');
		} else {
			const render = this.logsTracker.getRender(
				this._currentActiveTextEditor.document.fileName
			);
			content = `
				<div id="scrollableLiveValues">
					${render}
					<div id="tooltipBackground"></div>
				</div>`;
		}
		this._panel.webview.html = this._liveValuesHTML(content);
		this.scrollPanel(this._currentActiveTextEditor);
	}

	private _liveValuesHTML(content: string) {
		return this._getHtmlForWebview(
            this._panel.webview,
            `<div id="header">
				${this.testSelect.html()}
				<a id="issueLink" target="_blank" href="https://github.com/Fraser-Greenlee/live-coder/issues">Feedback</a>
			</div>
			${content}`
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
        const stylesHighlightUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "webview_src", "highlight.css")
        );
        const stylesMarkdownUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "webview_src", "markdown.css")
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
                <link href="${stylesHighlightUri}" rel="stylesheet">
                <link href="${stylesMarkdownUri}" rel="stylesheet">
            </head>
            <body>
                ${body}
                <div class="highlight" id="tooltip"></div>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
	}

	private _liveValuesErrorMessage(title: string, body: string) {
		return `
			<div class="centre">
				<div class="widthLimiter">
					<span><b>${title}</b> ${body}</span>
					<div id="postHolder">
						<div class="post">
							<h2>Welcome!</h2>
                            <p>Get started by installing LiveCoder with:</p>
                            <pre class="code-active-line"><code class="language-bash">pip install live_coder</code></pre>
                            <p>Next add snoop to track values.</p>
                            <pre class="code-active-line"><code class="code-line language-python code-line language-python"><div><span class="hljs-keyword">from</span> live_coder <span class="hljs-keyword">import</span> snoop

<span class="hljs-meta">@snoop</span>
<span class="hljs-function"><span class="hljs-keyword">def</span> <span class="hljs-title">my_first_method</span>():</span>
    <span class="hljs-keyword">pass</span></div></code></pre>
                            <p>Now run your code to update LiveCoder.</p>
						</div>
					</div>
				</div>
			</div>`;
	}

	private _openFunctionCall(callId: string) {
		if (vscode.workspace.workspaceFolders && callId) {
			const callScript = callId.split(':')[0];
			vscode.workspace.openTextDocument(callScript).then(doc => {
				vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
			}, err => {
				console.log(err);	
			});
		}
	}
}