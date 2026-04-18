import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Card content</Card>);
    expect(screen.getByText("Card content")).toBeInTheDocument();
  });

  it("applies hover classes by default", () => {
    const { container } = render(<Card>Content</Card>);
    expect(container.firstChild).toHaveClass("transition-all");
  });

  it("can disable hover effects", () => {
    const { container } = render(<Card hover={false}>Content</Card>);
    expect(container.firstChild).not.toHaveClass("cursor-pointer");
  });

  it("applies glow class when glow prop is set", () => {
    const { container } = render(<Card glow>Content</Card>);
    expect(container.firstChild).toHaveClass("shadow-lg");
  });

  it("accepts custom className", () => {
    const { container } = render(<Card className="custom-class">Content</Card>);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
