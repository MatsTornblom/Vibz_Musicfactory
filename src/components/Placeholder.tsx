export function Placeholder({ title, description, comingIn }: { title: string; description: string; comingIn: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 max-w-2xl">
        <p className="text-gray-300">{description}</p>
        <p className="text-sm text-gray-500 mt-4">Coming in {comingIn}.</p>
      </div>
    </div>
  );
}
