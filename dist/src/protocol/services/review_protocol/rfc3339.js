const rfc3339Pattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
export function isRfc3339DateTime(value) {
    if (typeof value !== 'string') {
        return false;
    }
    const match = rfc3339Pattern.exec(value);
    if (!match) {
        return false;
    }
    const [, year, month, day, hour, minute, second, offset] = match;
    if (!isValidCalendarDate(Number(year), Number(month), Number(day))
        || Number(hour) > 23
        || Number(minute) > 59
        || Number(second) > 59
        || !isValidTimeZoneOffset(offset)) {
        return false;
    }
    return !Number.isNaN(Date.parse(value));
}
function isValidCalendarDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1) {
        return false;
    }
    return day <= getDaysInMonth(year, month);
}
function getDaysInMonth(year, month) {
    if (month === 2) {
        return isLeapYear(year) ? 29 : 28;
    }
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
function isValidTimeZoneOffset(offset) {
    if (offset === 'Z') {
        return true;
    }
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(4, 6));
    return hours <= 23 && minutes <= 59;
}
