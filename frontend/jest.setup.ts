import "@testing-library/jest-dom";
import React from "react";

jest.mock("next/image", () => {
  return {
    __esModule: true,
    default: ({ src, alt, ...rest }: any) => {
      const imageSrc = typeof src === "string" ? src : src?.src ?? "";
      // Fjern Next spesifikke props som ikke finnes på <img>
      // f.eks. "fill" skaper React-advarsel i JSDOM
      const { fill: _omitFill, loader: _omitLoader, ...imgProps } = rest || {};
      return React.createElement("img", { ...imgProps, src: imageSrc, alt });
    },
  };
});
