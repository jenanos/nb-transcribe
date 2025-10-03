import { render, screen } from "@testing-library/react";

import Home from "../page";

describe("Home page", () => {
  test("viser opplastingsskjema", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "NB-transcribe", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Opplasting", level: 2 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Last opp lydfil")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Transkribering" })
    ).toBeInTheDocument();
  });
});
