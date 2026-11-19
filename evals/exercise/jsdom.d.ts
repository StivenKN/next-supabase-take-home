// jsdom ships without types, and @types/jsdom would add a dependency for the
// two classes page.ts uses. This declares just those.
declare module "jsdom" {
  export class VirtualConsole {}
  export class JSDOM {
    constructor(
      html: string,
      options?: {
        runScripts?: "dangerously";
        pretendToBeVisual?: boolean;
        virtualConsole?: VirtualConsole;
      },
    );
    readonly window: Window & typeof globalThis;
  }
}
