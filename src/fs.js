const FILE_NAME_REGEX = /^[^<>:"/\\|?*\x00-\x1F]+$/;

const get = r => localStorage.getItem(r);
const set = (r, v) => localStorage.setItem(r, v);
const del = r => localStorage.removeItem(r);

export class FileSystem {
    constructor(childFs = null, cwd = "/") {
        if (cwd === "/") this.cwd = [];
        else this.cwd = childFs.path(cwd).split("/").slice(1);
    };

    path(path) {
        const result = path[0] === "/" ? [] : [...this.cwd];
        if (path[0] === "/") path = path.substring(1);
        const spl = path.split(/[\/\\]/);

        for (const part of spl) {
            if (!part || part === ".") {
                continue;
            }
            if (part === "..") {
                result.pop();
                continue;
            }
            if (!FILE_NAME_REGEX.test(part)) {
                return null;
            }
            result.push(part);
        }
        return "/" + result.join("/");
    };

    __addFileToDir(dir, file) {
        const existing = this.__getFileContent(dir);
        set(`webos.fs.content:${dir}`, (existing.length > 0 ? existing + "/" : "") + file);
        set(`webos.fs.editedAt:${dir}`, Date.now());
    };

    __removeFileFromDir(dir, file) {
        const existing = this.__getFileContent(dir).split("/").filter(i => i !== file);
        set(`webos.fs.content:${dir}`, existing.join("/"));
        set(`webos.fs.editedAt:${dir}`, Date.now());
    };

    __unlinkPath(path) {
        del(`webos.fs.type:${path}`);
        del(`webos.fs.content:${path}`);
        del(`webos.fs.editedAt:${path}`);
        this.__removeFileFromDir(this.path(path + "/.."), path.split("/").at(-1));
    };

    exists(path) {
        return this.getFileType(path) !== 0;
    };

    readFile(path) {
        path = this.path(path);
        if (this.getFileType(path) !== 1) return null;
        return this.__getFileContent(path);
    };

    readdir(path) {
        path = this.path(path);
        if (this.getFileType(path) !== 2) return null;
        const r = this.__getFileContent(path);
        if (r.length === 0) return [];
        return r.split("/");
    };

    readdirRecursive(path) {
        path = this.path(path);
        if (this.getFileType(path) !== 2) return null;
        const r = this.__getFileContent(path);
        const obj = {};
        if (r.length === 0) return obj;
        for (const sp of r.split("/")) {
            const pt = this.path(path + "/" + sp);
            if (this.getFileType(pt) === 1) obj[sp] = this.readFile(pt);
            else obj[sp] = this.readdirRecursive(pt);
        }
        return obj;
    };

    mkdir(path) {
        path = this.path(path);
        if (this.exists(path)) return true;
        const parentPath = this.path(path + "/..");
        const parent = this.getFileType(parentPath);
        if (parent === 0 && !this.mkdir(parentPath)) return false;
        if (parent === 1) return false;
        set(`webos.fs.content:${path}`, "");
        set(`webos.fs.type:${path}`, 2);
        set(`webos.fs.createdAt:${path}`, Date.now());
        set(`webos.fs.editedAt:${path}`, Date.now());

        this.__addFileToDir(this.path(path + "/.."), path.split("/").at(-1));
        return true;
    };

    writeFile(path, content) {
        path = this.path(path);
        const existingType = this.getFileType(path);
        if (existingType === 2) return false;
        if (existingType === 0) {
            set(`webos.fs.type:${path}`, 1);
            set(`webos.fs.createdAt:${path}`, Date.now());
        }
        set(`webos.fs.content:${path}`, content);
        set(`webos.fs.editedAt:${path}`, Date.now());

        this.__addFileToDir(this.path(path + "/.."), path.split("/").at(-1));
        return true;
    };


    copyFile(from, to) {
        from = this.path(from);
        to = this.path(to);
        const content = this.readFile(from);
        if (content === null) return false;
        return this.writeFile(to, content);
    };

    rm(path) {
        const type = this.getFileType(path);
        if (type === 0) return false;
        if (type === 1) return this.rmdir(path);
        return this.rmfile(path);
    };

    rmfile(path) {
        path = this.path(path);
        if (this.getFileType(path) !== 1) return false;
        this.__unlinkPath(path);
        return true;
    };

    rmdir(path, recursive = false) {
        if (recursive) return this.rmDirRecursive(path);
        return this.rmEmptyDir(path);
    };

    rmEmptyDir(path) {
        path = this.path(path);
        if (this.getFileType(path) !== 2) return false;
        if (this.__getFileContent(path) === null) return false;
        this.__unlinkPath(path);
        return true;
    };

    rmDirRecursive(path) {
        path = this.path(path);
        if (this.getFileType(path) !== 2) return false;
        const files = this.readdir(path);
        if (files === null) return false;
        for (let file of files) {
            file = this.path(path + "/" + file)
            if (this.getFileType(path) === 2) {
                this.rmDirRecursive(file);
            } else {
                this.rmfile(file);
            }
        }
        if (path) this.rmEmptyDir(path); // do not remove the root directory
        return true;
    };

    getFileType(path) {
        path = this.path(path);
        return parseInt(get(`webos.fs.type:${path}`) || 0);
    };

    __getFileContent(path) {
        path = this.path(path);
        return get(`webos.fs.content:${path}`);
    };

    getFileCreatedAt(path) {
        path = this.path(path);
        return get(`webos.fs.createdAt:${path}`);
    };

    getFileEditedAt(path) {
        path = this.path(path);
        return get(`webos.fs.editedAt:${path}`);
    };

    getBinaries() {
        const binaries = {};
        const pathFile = this.readFile(".path");
        if (pathFile !== null) {
            for (const path of pathFile.split("\n")) {
                if (!path.trim()) continue;
                const contents = this.readdir(path);
                if (contents === null) continue;
                for (const file of contents) {
                    const filePath = path + "/" + file;
                    if (this.getFileType(filePath) !== 1 || file.includes(".")) continue;
                    binaries[file] = filePath;
                }
            }
        }

        return binaries;
    };
}

export const fs = new FileSystem;
if (!fs.exists("")) {
    set(`webos.fs.content:/`, "");
    set(`webos.fs.type:/`, 2);
    set(`webos.fs.createdAt:/`, Date.now());
    set(`webos.fs.editedAt:/`, Date.now());
}
fs.mkdir(".bin");
fs.writeFile(".bin/echo", `
main:
    mov eax, 0
    syscall 13
    jmp loop

loop:
    mov eax, [0]
    mov ebx, 2
    mov ecx, 1
    syscall 14
    je [1], 0, exit

    mov eax, 2
    syscall 1
    str 2, " "
    syscall 1

    jmp loop

exit:
    mov 0, 10
    mov 1, 0
    mov eax, 0
    syscall 1
    mov eax, 0
    syscall 0
`);
fs.writeFile(".bin/clear", `
main:
    mov 0, 1
    mov 1, 0
    syscall 1
    mov eax, 0
    syscall 0
`);
fs.writeFile(".bin/cat", `
main:
    mov eax, 0
    syscall 13
    mov ebx, 1
    mov ecx, 0
    mov eax, [0]
    syscall 14
    
    je [0], 0, no_argument
    
    add 0, 2
    mov ecx, [0]
    inc 0
    mov eax, 1
    mov ebx, [0]
    syscall 2
    
    je [ecx], 0, file_does_not_exist
    
    mov eax, ecx
    inc eax
    syscall 1
    
    mov eax, 0
    mov 0, '\\n'
    mov 1, 0
    syscall 1
    mov eax, 0
    syscall 0

no_argument:
    mov eax, 0
    str 0, "Usage: cat <filename>\\n"
    syscall 1
    mov eax, 1
    syscall 0

file_does_not_exist:
    add ecx, 2
    mov eax, ecx
    str ecx, "Couldn't find the file: "
    syscall 1
    
    mov eax, 1
    syscall 1
    
    mov 0, '\\n'
    mov 1, 0
    mov eax, 0
    syscall 1
    
    mov eax, 0
    syscall 0
`);
fs.writeFile(".bin/test", `
main:
    mov eax, 0
    str 0, "hello, world", 10, 10
    syscall 1
    syscall 0
`);
if (!fs.exists(".path")) fs.writeFile(".path", "/.bin\n");
