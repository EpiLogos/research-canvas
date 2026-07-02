import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineAxis } from "./TimelineAxis";
import type { AxisTick } from "./ticks";

describe("TimelineAxis", () => {
  test("renders one labelled tick per AxisTick at its px", () => {
    const ticks: AxisTick[] = [
      { year: 1600, px: 100, label: "1600 CE" },
      { year: 1700, px: 300, label: "1700 CE" },
    ];
    render(<TimelineAxis ticks={ticks} height={48} />);
    const t1 = screen.getByTestId("axis-tick-1600");
    const t2 = screen.getByTestId("axis-tick-1700");
    expect(t1).toHaveTextContent("1600 CE");
    expect(t1.style.left).toBe("100px");
    expect(t2.style.left).toBe("300px");
  });
});
