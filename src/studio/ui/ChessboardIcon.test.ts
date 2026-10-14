import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChessboardIcon } from "./ChessboardIcon";

describe("ChessboardIcon", () => {
  it("renders a 4x4 checker: 8 filled cells plus a stroked outer square", () => {
    const markup = renderToStaticMarkup(React.createElement(ChessboardIcon));
    // 8 dark checker cells use fill="currentColor"; the outer frame does not.
    assert.equal(markup.match(/fill="currentColor"/g)?.length, 8);
    assert.match(markup, /viewBox="0 0 24 24"/);
    assert.match(markup, /stroke="currentColor"/);
    // Outer frame rect is the only rect without a fill attribute of its own.
    assert.match(markup, /<rect x="2" y="2" width="20" height="20"/);
  });

  it("honors the size prop like lucide icons", () => {
    const markup = renderToStaticMarkup(React.createElement(ChessboardIcon, { size: 13 }));
    assert.match(markup, /width="13"/);
    assert.match(markup, /height="13"/);
  });

  it("passes extra props through to the svg", () => {
    const markup = renderToStaticMarkup(
      React.createElement(ChessboardIcon, { "aria-hidden": true, className: "board-glyph" }),
    );
    assert.match(markup, /aria-hidden="true"/);
    assert.match(markup, /class="board-glyph"/);
  });
});
