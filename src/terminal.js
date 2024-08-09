import {FileSystem} from "./fs.js";
import {Process} from "./process.js";

export class Terminal {
    fs = new FileSystem;
    runningProcess = null;
    allowsInput = true;
    inputContent = "";
    line = "";

    constructor() {
        this.__newline();
        this.__show_command_prompt();
    };

    write(text) {
        for (let i = 0; i < text.length; i++) {
            if (text[i] === "\n") this.__newline();
            else if (text[i] === "\x01") this.__clear();
            else this.__char(text[i]);
        }
    };

    async input(char, ctrl, shift, alt) {
        if (!this.allowsInput) return;
        if (this.runningProcess) {
            // inform the process about the key press
        } else {
            if (char === "l" && ctrl) {
                this.__clear();
            } else if (char === "\b") {
                this.__input_backspace();
            } else if (char === "\n") {
                await this.__input_newline();
            } else if (char === "\t") {
                this.__input_char(" ");
                this.__input_char(" ");
            } else {
                this.__input_char(char);
            }
        }
    };

    __input_char(char) {
        this.__char(char);
        this.inputContent += char;
    };

    async __input_newline() {
        this.__newline();
        const cmd = this.inputContent.trim();
        this.inputContent = "";
        const cmdName = cmd.split(" ")[0];
        if (cmdName) {
            const binaries = this.fs.getBinaries();
            if (binaries[cmdName]) {
                const process = new Process(this.fs, binaries[cmdName], this);
                this.runningProcess = process;
                const code = await process.run(cmd.split(" ").slice(1));
                this.allowsInput = true;
                this.runningProcess = null;
                //this.write(`Process exited with code ${code}\n`);
            } else {
                this.write(`Command "${cmdName}" not found.\n`);
            }
        }
        this.__show_command_prompt();
    };

    __show_command_prompt() {
        this.write(`/${this.fs.cwd.join("/")}> `)
    };

    __input_backspace() {
        if (this.inputContent.length === 0) return;
        this.__backspace();
        this.inputContent = this.inputContent.slice(0, -1);
    };

    __clear() {
        this.line = "";
        if (!this.runningProcess) {
            this.inputContent = "";
            this.__show_command_prompt();
        }
    };

    __char(char) {
        this.line += char;
    };

    __backspace() {
        this.line = this.line.slice(0, -1);
    };

    __newline() {
        this.line = "";
    };
}