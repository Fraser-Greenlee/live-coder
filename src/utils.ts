

class Stack<T> {
    _store: T[] = [];
    push(val: T) {
      this._store.push(val);
    }
    peak(): T | undefined {
        if (this._store.length > 0) {
            return this._store[this._store.length-1];
        }
    }
    pop(): T | undefined {
      return this._store.pop();
    }
}


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
    Stack, isDigit, isLetter, split
};