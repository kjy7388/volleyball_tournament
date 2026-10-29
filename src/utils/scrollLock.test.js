import { describe, it, expect } from "vitest";
import { acquireScrollLock } from "./scrollLock";

// A minimal CSS declaration interface for ownership/order tests. Real CSSOM,
// native dialogs and wheel/touch behavior are covered by modal-scroll.spec.js.
function element(declarations = []) {
  const values = new Map(
    declarations.map(([property, value, priority = ""]) => [
      property,
      { value, priority },
    ]),
  );
  return {
    style: {
      [Symbol.iterator]: () => values.keys(),
      getPropertyValue: (property) => values.get(property)?.value || "",
      getPropertyPriority: (property) => values.get(property)?.priority || "",
      setProperty: (property, value, priority = "") =>
        values.set(property, { value, priority }),
      removeProperty: (property) => values.delete(property),
    },
  };
}
function documentWith(body = [], html = []) {
  return { body: element(body), documentElement: element(html) };
}
const overflow = (doc) =>
  [doc.documentElement, doc.body].map((e) =>
    e.style.getPropertyValue("overflow"),
  );
describe("공유 모달 스크롤 잠금", () => {
  it("마지막 잠금이 해제될 때만 원래 상태 복원", () => {
    const doc = documentWith();
    const releaseParent = acquireScrollLock(doc);
    const releaseChild = acquireScrollLock(doc);
    expect(overflow(doc)).toEqual(["hidden", "hidden"]);
    releaseParent();
    expect(overflow(doc)).toEqual(["hidden", "hidden"]);
    releaseChild();
    expect(overflow(doc)).toEqual(["", ""]);
  });
  it("역순 해제도 동일하며 중복 cleanup은 다른 잠금을 해제하지 않음", () => {
    const doc = documentWith();
    const first = acquireScrollLock(doc);
    const second = acquireScrollLock(doc);
    second();
    second();
    expect(overflow(doc)).toEqual(["hidden", "hidden"]);
    const third = acquireScrollLock(doc);
    first();
    first();
    expect(overflow(doc)).toEqual(["hidden", "hidden"]);
    third();
    expect(overflow(doc)).toEqual(["", ""]);
  });
  it("기존 shorthand·축별 값·important와 관련 없는 변경을 보존", () => {
    const doc = documentWith(
      [
        ["overflow", "scroll", "important"],
        ["overflow-x", "clip"],
        ["color", "blue"],
      ],
      [["overflow-y", "auto", "important"]],
    );
    const a = acquireScrollLock(doc);
    const b = acquireScrollLock(doc);
    doc.body.style.setProperty("color", "red");
    a();
    b();
    expect(doc.body.style.getPropertyValue("overflow")).toBe("scroll");
    expect(doc.body.style.getPropertyPriority("overflow")).toBe("important");
    expect(doc.body.style.getPropertyValue("overflow-x")).toBe("clip");
    expect(doc.body.style.getPropertyPriority("overflow-x")).toBe("");
    expect(doc.documentElement.style.getPropertyValue("overflow-y")).toBe(
      "auto",
    );
    expect(doc.documentElement.style.getPropertyPriority("overflow-y")).toBe(
      "important",
    );
    expect(doc.body.style.getPropertyValue("color")).toBe("red");
  });
  it("원래 hidden이었다면 auto로 바꾸지 않음", () => {
    const doc = documentWith([["overflow", "hidden", "important"]]);
    acquireScrollLock(doc)();
    expect(doc.body.style.getPropertyValue("overflow")).toBe("hidden");
    expect(doc.body.style.getPropertyPriority("overflow")).toBe("important");
  });
  it("StrictMode setup-cleanup-setup 및 다시 열기에서 누수 없음", () => {
    const doc = documentWith();
    const first = acquireScrollLock(doc);
    first();
    const second = acquireScrollLock(doc);
    first();
    expect(overflow(doc)).toEqual(["hidden", "hidden"]);
    second();
    const third = acquireScrollLock(doc);
    third();
    expect(overflow(doc)).toEqual(["", ""]);
  });
  it("서로 다른 문서의 잠금은 독립적", () => {
    const a = documentWith();
    const b = documentWith();
    const releaseA = acquireScrollLock(a);
    const releaseB = acquireScrollLock(b);
    releaseA();
    expect(overflow(a)).toEqual(["", ""]);
    expect(overflow(b)).toEqual(["hidden", "hidden"]);
    releaseB();
  });
  it("DOM이 없으면 안전하게 cleanup 가능", () => {
    expect(() => acquireScrollLock(null)()).not.toThrow();
    expect(() => acquireScrollLock({})()).not.toThrow();
  });
});
