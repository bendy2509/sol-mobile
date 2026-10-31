// The repositories only read Platform.OS: a phone build
const Platform = { OS: 'android', select: (o) => (o.android !== undefined ? o.android : o.native !== undefined ? o.native : o.default) };
module.exports = { Platform };
