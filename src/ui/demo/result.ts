export type Assert = { name: string; pass: boolean; detail: string };

export type DemoResult = {
  scenario: string;
  pass: boolean;
  asserts: Assert[];
  frames: string[];
};

/** What a demo checked and the frames it took; written as `result.json`. */
export class Asserts {
  private asserts: Assert[] = [];
  private frames: string[] = [];

  constructor(private scenario: string) {}

  check(name: string, pass: boolean, detail: string) {
    this.asserts.push({ name, pass, detail });
  }

  frame(path: string) {
    this.frames.push(path);
  }

  threw(e: unknown) {
    this.check("script", false, e instanceof Error ? e.message : String(e));
  }

  result(): DemoResult {
    return {
      scenario: this.scenario,
      // Checking nothing proves nothing.
      pass: this.asserts.length > 0 && this.asserts.every((a) => a.pass),
      asserts: [...this.asserts],
      frames: [...this.frames],
    };
  }
}
