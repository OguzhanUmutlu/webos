import {FileSystem} from "./fs.js";

const DIGITS = [..."0123456789"];
const LETTERS = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIKLMNOPQRSTUVWXYZ_"];

let _uuid = 0;

export class Process {
    memory = {};
    regMemory = {};

    /**
     * @param {FileSystem} fs
     * @param {string} path
     * @param {Terminal} terminal
     */
    constructor(fs, path, terminal) {
        path = fs.path(path);
        this.fs = fs;
        this.path = path;
        this.terminal = terminal;
    };

    async run(argv) {
        const fileReaddir = {};
        const argvRead = {};

        const SYSCALL_EXIT = 0;
        const SYSCALL_PRINT = 1;
        const SYSCALL_READ_FILE = 2;
        const SYSCALL_WRITE_FILE = 3;
        const SYSCALL_MKDIR = 4;
        const SYSCALL_RMDIR = 5;
        const SYSCALL_RMFILE = 6;
        const SYSCALL_FILE_EXISTS = 7;
        const SYSCALL_FILE_TYPE = 8;
        const SYSCALL_FILE_EDITED_AT = 9;
        const SYSCALL_FILE_CREATED_AT = 10;
        const SYSCALL_START_READDIR = 11;
        const SYSCALL_ITER_READDIR = 12;
        const SYSCALL_START_ARGV = 13;
        const SYSCALL_ITER_ARGV = 14;
        const SYSCALL_CD = 15;

        function exit(code) {
            throw code;
        }

        const getptr = e => {
            // 0 -> memory[0]
            // eax -> memory[eax]
            if (typeof e === "string") return this.regMemory[e] || 0;
            if (typeof e === "number") return this.memory[e] || 0;
            if (e.type === "string") exit(-e.line);
            if (e.type === "word") return this.regMemory[e.value] || 0;
            return this.memory[e.value] || 0;
        };

        const getmem = e => {
            if (typeof e === "string") return this.regMemory[e] || 0;
            if (typeof e === "number") return e;
            if (e.type === "string") exit(-e.line);
            if (e.type === "word") return this.regMemory[e.value] || 0;
            if (e.type === "pointer") {
                if (typeof e.value === "number") return this.memory[e.value] || 0;
                return this.memory[this.regMemory[e.value] || 0] || 0;
            }
            return e.value;
        };

        const setmem = (e, v) => {
            if (typeof e === "string") return this.regMemory[e] = v;
            if (typeof e === "number") return this.memory[e] = v;
            if (e.type === "string") exit(-e.line);
            if (e.type === "word") {
                return this.regMemory[e.value] = v;
            }
            if (e.type === "pointer") return this.memory[getmem(e.value)] = v;
            return this.memory[e.value] = v;
        };

        const getstr = ind => {
            let str = "";
            while (this.memory[ind]) {
                str += String.fromCharCode(this.memory[ind]);
                ind++;
            }
            return str;
        };

        const setstr = (ind, str) => {
            for (let i = 0; i < str.length; i++) {
                this.memory[ind + i] = str.charCodeAt(i);
            }
            this.memory[ind + str.length] = 0;
        };

        function argCount(line, args, count) {
            if (args.length !== count) return exit(-line);
        }

        const content = this.fs.readFile(this.path);
        if (content === null) exit(-1);
        const lines = content.split("\n");
        const labels = {};
        let label = null;
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            if (!line) continue;
            if (line.trim().endsWith(":")) {
                label = line.trim().slice(0, -1);
                labels[label] = [];
            } else {
                if (label === null) {
                    console.debug("Line: " + line);
                    return -lineIndex;
                }
                const tokens = [];
                for (let i = 0; i < line.length; i++) {
                    const c = line[i];
                    if (["\t", " ", "\r", ","].includes(c)) {
                        continue;
                    }
                    if (c === ";") break;
                    if (c === "'") {
                        i += 2;
                        let chr = line[i - 1];
                        if (line[i - 1] === "\\") {
                            i++;
                            chr = line[i - 1];
                            if (line[i - 1] === "n") chr = "\n";
                            if (line[i - 1] === "t") chr = "\t";
                            if (line[i - 1] === "r") chr = "\r";
                        }
                        tokens.push({
                            type: "int",
                            value: chr.charCodeAt(0),
                            line: lineIndex,
                            lineContent: line
                        });
                        continue;
                    }
                    if (c === '"') {
                        let str = "";
                        i++;
                        for (; i < line.length; i++) {
                            if (line[i] === "\\") {
                                let next = line[++i];
                                if (next === "n") next = "\n";
                                str += next;
                                continue;
                            }
                            if (line[i] === '"') {
                                i++;
                                break;
                            }
                            str += line[i];
                        }
                        if (line[i - 1] !== '"') {
                            console.debug("Line: " + line);
                            return -lineIndex;
                        }
                        tokens.push({type: "string", value: str, line: lineIndex, lineContent: line});
                        continue;
                    }
                    if (DIGITS.includes(c) || (c === "[" && DIGITS.includes(line[i + 1]))) {
                        let str = "";
                        if (c === "[") i++;
                        for (; i < line.length; i++) {
                            if (!DIGITS.includes(line[i])) {
                                i--;
                                break;
                            }
                            str += line[i];
                        }
                        str = parseInt(str);
                        if (c === "[") {
                            tokens.push({type: "pointer", value: str, line: lineIndex, lineContent: line});
                            if (line[++i] !== "]") {
                                console.debug("Line: " + line);
                                return -lineIndex;
                            }
                        } else tokens.push({type: "int", value: str, line: lineIndex, lineContent: line});
                        continue;
                    }
                    if (LETTERS.includes(c) || (c === "[" && LETTERS.includes(line[i + 1]))) {
                        let str = "";
                        if (c === "[") i++;
                        for (; i < line.length; i++) {
                            if (!LETTERS.includes(line[i])) {
                                i--;
                                break;
                            }
                            str += line[i];
                        }
                        str = str.toLowerCase();
                        if (c === "[") {
                            tokens.push({type: "pointer", value: str, line: lineIndex, lineContent: line});
                            if (line[++i] !== "]") {
                                console.debug("Line: " + line);
                                return -lineIndex;
                            }
                        } else tokens.push({type: "word", value: str, line: lineIndex, lineContent: line});
                        continue;
                    }
                    tokens.push({type: "symbol", value: c, line: lineIndex, lineContent: line});
                }
                if (tokens.length > 0) labels[label].push(tokens);
            }
        }

        const runLabel = async label => {
            console.debug("Running label: " + label, this.memory, this.regMemory);
            await new Promise(r => setTimeout(r, 0));
            label = labels[label];
            for (let [name, ...args] of label) {
                const line = name.line;
                console.debug("Running line: " + (line + 1) + ") " + name.lineContent, this.memory, this.regMemory);
                if (name.type !== "word") return exit(-line)
                let [a0, a1, a2] = args;
                switch (name.value) {
                    case "mov":
                        argCount(line, args, 2);
                        setmem(a0, getmem(a1));
                        break;
                    case "syscall":
                        argCount(line, args, 1);
                        a0 = getmem(a0);
                        switch (a0) {
                            case SYSCALL_EXIT: // 0
                                exit(getmem("eax"));
                                return;
                            case SYSCALL_PRINT: // 1
                                this.terminal.write(getstr(getmem("eax")));
                                break;
                            case SYSCALL_READ_FILE: // 2
                                const content = this.fs.readFile(getstr(getmem("eax")));
                                if (content !== null) setstr(getmem("ebx"), content);
                                setmem(getmem("ecx"), content === null ? 0 : 1);
                                break;
                            case SYSCALL_WRITE_FILE: // 3
                                setmem(getmem("ecx"), this.fs.writeFile(getstr(getmem("eax")), getstr(getmem("ebx"))) * 1);
                                break;
                            case SYSCALL_MKDIR: // 4
                                setmem(getmem("ebx"), this.fs.mkdir(getstr(getmem("eax"))) * 1);
                                break;
                            case SYSCALL_RMDIR: // 5
                                setmem(getmem("ebx"), this.fs.rmdir(getstr(getmem("eax"))) * 1);
                                break;
                            case SYSCALL_RMFILE: // 6
                                setmem(getmem("ebx"), this.fs.rmfile(getstr(getmem("eax"))) * 1);
                                break;
                            case SYSCALL_FILE_EXISTS: // 7
                                setmem(getmem("ebx"), this.fs.exists(getstr(getmem("eax"))) * 1);
                                break;
                            case SYSCALL_FILE_TYPE: // 8
                                setmem(getmem("ebx"), this.fs.getFileType(getstr(getmem("eax"))));
                                break;
                            case SYSCALL_FILE_EDITED_AT: // 9
                                setmem(getmem("eax"), this.fs.getFileEditedAt(getstr(getmem("eax"))) || 0);
                                break;
                            case SYSCALL_FILE_CREATED_AT: // 10
                                setmem(getmem("eax"), this.fs.getFileCreatedAt(getstr(getmem("eax"))) || 0);
                                break;
                            case SYSCALL_START_READDIR: // 11
                                if (this.fs.exists(getstr(getmem("eax")))) {
                                    _uuid++;
                                    fileReaddir[_uuid] = this.fs.readdir(getstr(getmem("eax")));
                                    setmem(getmem("eax"), _uuid);
                                } else setmem(getmem("eax"), 0);
                                break;
                            case SYSCALL_ITER_READDIR: // 12
                                if (!(getmem("eax") in fileReaddir)) exit(-line);
                                const t = fileReaddir[getmem("eax")].shift();
                                if (t === undefined) {
                                    setmem(getmem("ebx"), 0);
                                    break;
                                }
                                setstr(getmem("ebx"), t);
                                setmem(getmem("ecx"), t.length);
                                break;
                            case SYSCALL_START_ARGV: // 13
                                _uuid++;
                                argvRead[_uuid] = [...argv];
                                setmem(getmem("eax"), _uuid);
                                break;
                            case SYSCALL_ITER_ARGV: // 14
                                if (!(getmem("eax") in argvRead)) exit(-line);
                                const r = argvRead[getmem("eax")].shift();
                                if (r === undefined) {
                                    setmem(getmem("ebx"), 0);
                                    setmem(getmem("ecx"), 0);
                                    break;
                                }
                                setstr(getmem("ebx"), r);
                                setmem(getmem("ecx"), r.length);
                                break;
                            case SYSCALL_CD: // 15
                                const cd = this.fs.path(getstr(getmem("eax")));
                                let success = 0;
                                if (this.fs.exists(cd)) {
                                    success = 1;
                                    this.fs.cwd = cd.substring(1).split("/");
                                }
                                setmem(getmem("ebx"), success);
                                break;
                        }
                        break;
                    case "str":
                        if (args.length <= 1) return exit(-line);
                        let str = "";
                        for (const arg of args.slice(1)) {
                            if (arg.type === "string") str += arg.value;
                            else str += String.fromCharCode(getmem(arg));
                        }
                        setstr(getmem(a0), str);
                        break;
                    case "inc":
                        argCount(line, args, 1);
                        setmem(a0, getptr(a0) + 1);
                        break;
                    case "dec":
                        argCount(line, args, 1);
                        setmem(a0, getptr(a0) - 1);
                        break;
                    case "add":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) + getmem(a1));
                        break;
                    case "sub":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) - getmem(a1));
                        break;
                    case "mul":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) * getmem(a1));
                        break;
                    case "div":
                        argCount(line, args, 2);
                        setmem(a0, Math.floor(getptr(a0) / getmem(a1)));
                        break;
                    case "mod":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) % getmem(a1));
                        break;
                    case "or":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) | getmem(a1));
                        break;
                    case "and":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) & getmem(a1));
                        break;
                    case "xor":
                        argCount(line, args, 2);
                        setmem(a0, getptr(a0) ^ getmem(a1));
                        break;
                    case "not":
                        argCount(line, args, 1);
                        setmem(a0, ~getptr(a0));
                        break;
                    case "jmp":
                        argCount(line, args, 1);
                        if (a0.type !== "word") return exit(-line);
                        if (!(a0.value in labels)) return exit(-line);
                        await runLabel(a0.value);
                        return;
                    case "je":
                        argCount(line, args, 3);
                        if (a2.type !== "word") return exit(-line);
                        if (!(a2.value in labels)) return exit(-line);
                        if (getmem(a0) === getmem(a1)) {
                            await runLabel(a2.value);
                            return;
                        }
                        break;
                    case "jg":
                        argCount(line, args, 3);
                        if (a2.type !== "word") return exit(-line);
                        if (!(a2.value in labels)) return exit(-line);
                        if (getmem(a0) > getmem(a1)) {
                            await runLabel(a2.value);
                            return;
                        }
                        break;
                    case "jl":
                        argCount(line, args, 3);
                        if (a2.type !== "word") return exit(-line);
                        if (!(a2.value in labels)) return exit(-line);
                        if (getmem(a0) < getmem(a1)) {
                            await runLabel(a2.value);
                            return;
                        }
                        break;
                    case "call":
                        argCount(line, args, 1);
                        if (a0.type !== "word") return exit(-line);
                        if (!(a0.value in labels)) return exit(-line);
                        await runLabel(a0.value);
                        break;
                }
            }
        }

        if (!labels["main"]) return -1;

        return await runLabel("main").catch(code => {
            if (typeof code === "number") {
                if (code < 0) console.debug("Line: " + lines[-code]);
                return code;
            }
            throw code;
        });
    };
}