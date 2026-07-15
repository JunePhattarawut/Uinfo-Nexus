"use client";

import { useEffect } from "react";

function serializeForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return Array.from(data.entries())
    .map(([key, value]) => [key, typeof value === "string" ? value : value.name] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function IssueDirtySaveGuard({ formId, buttonId }: { formId: string; buttonId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    const button = document.getElementById(buttonId) as HTMLButtonElement | null;
    if (!form || !button) return;

    const controls = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[form="${formId}"]`));
    const baseline = serializeForm(form);

    const updateState = () => {
      const dirty = serializeForm(form) !== baseline;
      button.disabled = !dirty;
      button.title = dirty ? "Save changes" : "No changes to save";
      button.classList.toggle("opacity-50", !dirty);
      button.classList.toggle("cursor-not-allowed", !dirty);
    };

    const onSubmit = (event: SubmitEvent) => {
      if (serializeForm(form) === baseline) {
        event.preventDefault();
        alert("No changes to save");
      }
    };

    controls.forEach((control) => {
      control.addEventListener("input", updateState);
      control.addEventListener("change", updateState);
    });
    form.addEventListener("submit", onSubmit);
    updateState();

    return () => {
      controls.forEach((control) => {
        control.removeEventListener("input", updateState);
        control.removeEventListener("change", updateState);
      });
      form.removeEventListener("submit", onSubmit);
    };
  }, [formId, buttonId]);

  return null;
}
