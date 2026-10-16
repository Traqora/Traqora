"use client"


  }

  return (
    <div className="min-h-screen bg-background">

            <ResultsList
              flights={flights}
              isLoading={isLoading}
              error={error}
              hasMore={false}

            />
          </div>
        </div>
      </div>

  )
}
