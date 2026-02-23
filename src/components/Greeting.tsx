"use client";

export default function Greeting({ name }: { name?: string }) {
  const hour = new Date().getHours();
  let greeting: string;
  if (hour < 12) greeting = "Goedemorgen";
  else if (hour < 18) greeting = "Goedemiddag";
  else greeting = "Goedenavond";

  return (
    <h1 className="text-2xl font-bold text-gray-900">
      {greeting}, {name}
    </h1>
  );
}
