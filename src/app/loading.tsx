export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-5 h-11 w-full max-w-md animate-pulse rounded-xl bg-white/5" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[4/3] animate-pulse rounded-2xl bg-white/5"
            style={{ animationDelay: `${index * 40}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
