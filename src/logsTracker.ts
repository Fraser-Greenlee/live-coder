import * as vscode from "vscode";
import * as chokidar from "chokidar";
import * as lineReader from "line-reader";
import { LiveValuesPanel } from "./LiveValuesPanel";


function getCurrentFiles(path: string) {
    // list .txt files with first line here
    return [
        [
            'python m unittest teststestmainMyTestCasetestcalls.txt',
            'python -m unittest tests.test_main.MyTestCase.test_calls'
        ]
    ];
}


export class LogsTracker {

    public logsFolder: string;
    public selectedLogPath: string;
    public logFilesWithCommands: string[][] = [];
    public renders: {
        [logsPath: string]: {
            [path: string]: {
                [func: string]: {
                    [calls: string]: string
                }
            }
        }
    } = {};
    public selectedCallIds: {
        [path: string]:  {
            [func: string]: string
        }
    } = {};

	public constructor() {
        this.logsFolder = vscode.workspace.workspaceFolders![0].uri.path + '/.live_coder/';
        this.selectedLogPath = '';

        this.refresh();
        chokidar.watch(this.logsFolder).on('all', (event, path) => {
            console.log(event, path);
            this.refresh();
        });
	}

    public noneSelected() {
        return this.selectedLogPath === '';
    }

    public refresh() {
        this.logFilesWithCommands = getCurrentFiles(this.logsFolder);
        this.render();
        if (LiveValuesPanel.currentPanel) {
            LiveValuesPanel.currentPanel.refreshWebview();
        }
    }

    public render() {
        if (this.selectedLogPath) {
            let lines: string[];
            lineReader.eachLine(this.logsFolder + this.selectedLogPath, (line, last) => {
                lines.push(line);
            });
            
        }
        return '<h1>RENDER</h1>';
    }
}