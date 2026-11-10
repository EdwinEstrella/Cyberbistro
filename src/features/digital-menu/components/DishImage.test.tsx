import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DishImage } from "./DishImage";

describe("DishImage component", () => {
  it("renders an img tag with correct attributes when src is valid", () => {
    const html = renderToStaticMarkup(
      <DishImage
        src="https://images.unsplash.com/photo-test"
        alt="Hamburguesa Clásica"
      />
    );

    expect(html).toContain("<img");
    expect(html).toContain('src="https://images.unsplash.com/photo-test"');
    expect(html).toContain('alt="Hamburguesa Clásica"');
    expect(html).toContain("h-36");
    expect(html).not.toContain("dish-image-fallback");
  });

  it("returns null when src is null or empty string", () => {
    const htmlNull = renderToStaticMarkup(
      <DishImage src={null} alt="Sin foto" />
    );
    expect(htmlNull).toBe("");

    const htmlEmpty = renderToStaticMarkup(
      <DishImage src="" alt="Sin foto" />
    );
    expect(htmlEmpty).toBe("");
  });

  it("renders neutral placeholder with utensils icon and matching height on error", () => {
    const html = renderToStaticMarkup(
      <DishImage
        src="https://invalid-domain.com/broken-image.jpg"
        alt="Taco de Asada"
        initialError={true}
      />
    );

    expect(html).not.toContain("<img");
    expect(html).toContain('data-testid="dish-image-fallback"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Imagen no disponible para Taco de Asada"');
    expect(html).toContain("h-36");
    expect(html).toContain("w-full");
    expect(html).toContain("rounded-[20px]");
  });

  it("simulates the error event on the image and executes onError callback", () => {
    let capturedImgProps: React.ImgHTMLAttributes<HTMLImageElement> | undefined;
    const onErrorSpy = vi.fn();

    renderToStaticMarkup(
      <DishImage
        src="https://example.com/broken-dish.png"
        alt="Plato Roto"
        onError={onErrorSpy}
        onRenderImgProps={(props) => {
          capturedImgProps = props;
        }}
      />
    );

    expect(capturedImgProps).toBeDefined();
    expect(typeof capturedImgProps?.onError).toBe("function");

    // Simulate the error event dispatched by browser when image fails to load
    const simulatedErrorEvent = {
      type: "error",
      target: { src: "https://example.com/broken-dish.png" },
    } as unknown as React.SyntheticEvent<HTMLImageElement, Event>;

    capturedImgProps?.onError?.(simulatedErrorEvent);

    expect(onErrorSpy).toHaveBeenCalledTimes(1);
    expect(onErrorSpy).toHaveBeenCalledWith(simulatedErrorEvent);
  });
});
