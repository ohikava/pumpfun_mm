import { fileURLToPath } from 'url';

export var globallevel = {
    levelIndex: 0
};

const LEVELS = ['DEBUG', 'INFO', 'ERROR'];

export function setLevel(level: 'DEBUG' | 'INFO' | 'ERROR'): void {
    globallevel.levelIndex = LEVELS.indexOf(level.toUpperCase())
}

function formatMessage(level: 'DEBUG' | 'INFO' | 'ERROR', message: string): string {
    const currentTime = new Date();
    const hours = currentTime.getHours().toString().padStart(2, '0');
    const minutes = currentTime.getMinutes().toString().padStart(2, '0');
    const seconds = currentTime.getSeconds().toString().padStart(2, '0')
    const now = `${hours}:${minutes}:${seconds}`;

    const filePath = fileURLToPath(import.meta.url).replace(/^.*[\\/]/, '');
    const levelColor = level === 'DEBUG'? '\x1b[36m%s\x1b[0m' :
                          level === 'INFO'? '\x1b[32m%s\x1b[0m' :
                          level === 'ERROR'? '\x1b[31m%s\x1b[0m' :
                                              '\x1b[37m%s\x1b[0m';

    return levelColor.replace('%s', `[${now}] ${filePath}: ${message}`);
}

export function debug(message: string): void {
    if (globallevel.levelIndex <= LEVELS.indexOf('DEBUG')) {
            console.log(formatMessage('DEBUG', message));
    }
}

export function info(message: string): void {
    if (globallevel.levelIndex <= LEVELS.indexOf('INFO')) {
            console.log(formatMessage('INFO', message));
    }
}

export function error(message: string): void {
    if (globallevel.levelIndex <= LEVELS.indexOf('ERROR')) {
        console.log(formatMessage('ERROR', message));
    }
}
