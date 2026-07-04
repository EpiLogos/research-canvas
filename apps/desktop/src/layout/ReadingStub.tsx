interface ReadingStubProps {
  title?: string;
}

export function ReadingStub({ title }: ReadingStubProps) {
  return (
    <section className="ishell-reading-stub" data-testid="reading-pane">
      {title ? `Reading — ${title}` : "Reading lens — select a node to read"}
    </section>
  );
}
