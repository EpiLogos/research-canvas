import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined") {
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverMock
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      }
    })
  });

  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    writable: true,
    value: () => ({
      clearRect() {},
      createLinearGradient() {
        return {
          addColorStop() {}
        };
      },
      fillRect() {},
      getImageData() {
        return {
          data: new Uint8ClampedArray()
        };
      },
      putImageData() {},
      setTransform() {},
      drawImage() {},
      save() {},
      fillText() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      stroke() {},
      translate() {},
      scale() {},
      rotate() {},
      arc() {},
      fill() {},
      measureText() {
        return {
          actualBoundingBoxAscent: 0,
          actualBoundingBoxDescent: 0,
          actualBoundingBoxLeft: 0,
          actualBoundingBoxRight: 0,
          fontBoundingBoxAscent: 0,
          fontBoundingBoxDescent: 0,
          width: 0
        };
      },
      transform() {},
      rect() {},
      clip() {}
    })
  });
}

// Unit tests must never wait on the mutable browser workspace bridge unless
// they explicitly replace `fetch` to exercise that transport. T17 made app-tab
// restoration part of provider bootstrap, so partially mocked workspace
// services otherwise leak a real 127.0.0.1 request into jsdom and stall shell
// bootstrap until the bridge retry window expires.
const unitFetch = globalThis.fetch;
if (typeof unitFetch === "function") {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    let url: URL | null = null;
    try {
      url = new URL(rawUrl);
    } catch {
      // Fall through to the host fetch for non-URL inputs.
    }

    if (
      url?.hostname === "127.0.0.1" &&
      url.pathname === "/workspace/app-tabs"
    ) {
      const body = (init?.method ?? "GET").toUpperCase() === "POST"
        ? "null"
        : JSON.stringify({ tabs: [], activeTabId: null });
      return Promise.resolve(new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }

    return unitFetch(input, init);
  }) as typeof fetch;
}
