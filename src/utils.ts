
function isDigit(c: string) {
    return c >= '0' && c <= '9';
}

function isLetter(c: string) {
    return c.length === 1 && c.match(/[a-z]/i);
}

function split(s: string, c: string) {
    return s.split(c).filter(el => {
        return el.length > 0;
    });
}

export {
    isDigit, isLetter, split
};