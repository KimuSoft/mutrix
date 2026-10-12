import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function format(value: number) {
  return value.toLocaleString("en-US");
}
export function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`;
}
export async function copy(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    if (!ok) throw new Error("Copy is unavailable. Select and copy the value manually.");
  }
}
