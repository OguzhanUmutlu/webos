import {fs} from "./fs.js";
import {Terminal} from "./terminal.js";

const linesDiv = document.querySelector(".terminal-lines");
let lineDiv;
const cursorDiv = document.createElement("div");
cursorDiv.classList.add("cursor");
let waitingForAnimate = false;

function animate() {
    requestAnimationFrame(animate);
    if (waitingForAnimate) {
        terminal.__update_html();
        waitingForAnimate = false;
        linesDiv.scrollTop = linesDiv.scrollHeight;
    }
}

const terminal = new class extends Terminal {
    __update_html() {
        lineDiv.innerHTML = "";

        for (const char of this.line) {
            const span = document.createElement("span");
            if (char === " ") span.innerHTML = "&nbsp;";
            else span.textContent = char;
            lineDiv.appendChild(span);
        }
        lineDiv.appendChild(cursorDiv);
    };

    __add_line_div() {
        lineDiv = document.createElement("div");
        lineDiv.classList.add("terminal-line");
        linesDiv.appendChild(lineDiv);
        lineDiv.appendChild(cursorDiv);
    };

    __clear() {
        linesDiv.innerHTML = "";
        this.__add_line_div();
        super.__clear();
    };

    __char(char) {
        super.__char(char);
        waitingForAnimate = true;
    };

    __backspace() {
        super.__backspace();
        waitingForAnimate = true;
    };

    __newline() {
        if (lineDiv) this.__update_html();
        super.__newline();
        this.__add_line_div();
        this.__update_html();
        waitingForAnimate = false;
    };
};

addEventListener("keydown", e => {
    let key = e.key;
    key = {"Enter": "\n", "Backspace": "\b", "Tab": "\t"}[key] || key;
    if (key.length !== 1) return;
    if (key === "\t" || e.ctrlKey) e.preventDefault();
    if (e.ctrlKey && key === "k") return terminal.write("\n\n")
    terminal.input(key, e.ctrlKey, e.shiftKey, e.altKey).then(r => r);
});

animate();

window.fs = fs;