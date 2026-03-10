// Test fixture for class types with recursive/complex members

export class Container {
  private items: string[] = [];
  public name: string = "default";
  get count(): number { return this.items.length; }
}

// Generic class with Map property that triggers recursive typeToString
export class EventBus<TEvent extends { kind: string }> {
  private handlers = new Map<string, ((e: TEvent) => void)[]>();

  on(kind: TEvent["kind"], handler: (e: TEvent) => void): void {
    const existing = this.handlers.get(kind) ?? [];
    this.handlers.set(kind, [...existing, handler]);
  }

  emit(event: TEvent): void {
    this.handlers.get(event.kind)?.forEach((h) => h(event));
  }
}

interface TestEvent {
  kind: "test";
  data: string;
}

export const bus = new EventBus<TestEvent>();
