export function VendorDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-8 animate-pulse rounded-md bg-neutral-300" />
          <div className="h-7 w-40 animate-pulse rounded bg-neutral-300" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-neutral-300" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-40 animate-pulse rounded-md bg-neutral-300" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-neutral-300" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-md border border-neutral-300 bg-white p-4"
          >
            <div className="h-5 w-24 animate-pulse rounded bg-neutral-300" />
            <div className="h-7 w-24 animate-pulse rounded bg-neutral-300" />
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-4">
        <div className="h-6 w-24 animate-pulse rounded bg-neutral-300" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[0, 1].map((card) => (
            <div
              key={card}
              className="flex flex-col rounded-lg border border-border-default bg-white p-5"
            >
              <div className="flex gap-6">
                {(card === 0 ? [0, 1] : [0]).map((tab) => (
                  <div key={tab} className="flex flex-1 flex-col gap-2 pb-3">
                    <div className="h-3 w-28 animate-pulse rounded bg-neutral-300" />
                    <div className="h-6 w-20 animate-pulse rounded bg-neutral-300" />
                  </div>
                ))}
              </div>
              <div className="mt-4 h-[280px] w-full animate-pulse rounded-lg bg-neutral-200" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((card) => (
          <div
            key={card}
            className="flex flex-col gap-3 rounded-lg border border-border-default bg-white p-5"
          >
            <div className="h-5 w-32 animate-pulse rounded bg-neutral-300" />
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-8 w-full animate-pulse rounded bg-neutral-200"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
