import * as vscode from "vscode";
import * as readline from "readline";
import * as pathModule from "path";
import * as fs from "fs";
import { LiveValuesPanel } from "./LiveValuesPanel";
import { parseExecution } from "./logsParser";
import { AllFiles } from "./executionClasses";
import { renderCalls } from "./logsRenderCalls";
import { renderFiles } from "./logsRenderFiles";
import * as config from "./config";
import { split } from "./utils";


async function getLogFiles(liveCoderFolder: string) {
    let logFiles: {path: string, command: string}[] = new Array();
    var files = fs.readdirSync(liveCoderFolder);
    for (const file of files) {
        if (!file.endsWith('.log')) {
            return;
        }

        const rl = readline.createInterface({
            input: fs.createReadStream(pathModule.join(liveCoderFolder, file)), //or fileStream 
            output: process.stdout
        });

        const it = rl[Symbol.asyncIterator]();
        const line1 = (await it.next()).value;
        const line2 = (await it.next()).value;
        if (typeof(line1) === "string" && typeof(line2) === "string" && line2) {
            logFiles.push({path: file, command: line1.substring(line1.length - 100, line1.length)});
        }
    }
    return logFiles;
}


export class LogsTracker {

    public logsPath: string;
    public selectedLogFile: string;
    public logFilesWithCommands: {path: string, command: string}[];
    public renders: {
        [logsPath: string]: {
            [path: string]: string
        }
    } = {};
    public selectedCallIds: {
        [path: string]:  {
            [func: string]: string
        }
    } = {};

	public constructor() {
        this.logsPath = pathModule.join(vscode.workspace.workspaceFolders![0].uri.path, config.logsFolder);
        this.logFilesWithCommands = new Array();
        this.selectedLogFile = '';

        if (!fs.existsSync(this.logsPath)) {
            fs.mkdirSync(this.logsPath);
        }
        this.refresh();
        fs.watch(this.logsPath, (eventType, filename) => {
            // could be either 'rename' or 'change'. new file event and delete
            // also generally emit 'rename'
            console.log('watch', eventType, filename);
            if (this.selectedLogFile === filename) {
                this.refresh();
            }
        });
	}

    public noneSelected() {
        this.selectedCallIds = {};
        return this.selectedLogFile === '';
    }

    public changeLogFile(path: string) {
        this.selectedCallIds = {};
        this.selectedLogFile = path;
    }

    public refresh() {
        getLogFiles(this.logsPath).then((logFiles) => {
            this.logFilesWithCommands = logFiles!;
            this.render();
            if (LiveValuesPanel.currentPanel) {
                LiveValuesPanel.currentPanel.refreshWebview();
            }
        });
    }

    public getRender(path: string) {
        if (!this.selectedLogFile) {
            return `
                <div class="centre">
                    <div class="widthLimiter">
                        <span><b>No active test or log file.</b> Select a test method or log file from the dropdown above.</span>
                    </div>
                </div>
            `;
        }
        if (!(this.selectedLogFile in this.renders)) {
            this.render(); // populate `this.renders`
        }
        if (path in this.renders[this.selectedLogFile]) {
            return this.renders[this.selectedLogFile][path];
        } else {
            return '<h1>no logs for this file</h1>';
        }
    }

    private updateCallIds(
        selectedCallIds: { [path: string]:  {[func: string]: string} },
        funcCallRender: {
            [path: string]: {
                [func: string]: {
                    startingLineNumber: number
                    calls: {[callId: string]: string}
                }
            }
        }
    ) {
        selectedCallIds = {};
        for (let path in funcCallRender) {
            if (!(path in selectedCallIds)) {
                selectedCallIds[path] = {};
            }
            for (let functionName in funcCallRender[path]) {
                if (!(functionName in selectedCallIds[path]) || !(selectedCallIds[path][functionName] in funcCallRender[path][functionName]['calls'])) {
                    selectedCallIds[path][functionName] = `${path}:${functionName}:0`;
                }
            }
        }
        return selectedCallIds;
    }    

    public render() {
        // TODO bug before here
        if (this.selectedLogFile) {
            let lines: string[] = split(
                fs.readFileSync(pathModule.join(this.logsPath, this.selectedLogFile)).toString(),
                "\n"
            );
            const parse: AllFiles = parseExecution(lines);
            const funcCallRender = renderCalls(parse);
            this.selectedCallIds = this.updateCallIds(this.selectedCallIds, funcCallRender);
            this.renders[this.selectedLogFile] = renderFiles(funcCallRender, this.selectedCallIds);
        }
    }
}
