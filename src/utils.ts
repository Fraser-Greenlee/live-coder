
function isDigit(c: string) {
    return c >= '0' && c <= '9';
}

function isLetter(c: string) {
    return c.length === 1 && c.match(/[a-z]/i);
}

export {
    isDigit, isLetter
}