import '@testing-library/jest-dom';

// jsdom doesn't implement these DOM methods, but Radix UI (used by Click UI overlays like Flyout)
// calls them during open/close/interaction. Stub them so overlay components can be tested.
const proto = window.HTMLElement.prototype;
proto.scrollIntoView ??= () => {};
proto.hasPointerCapture ??= () => false;
proto.setPointerCapture ??= () => {};
proto.releasePointerCapture ??= () => {};
