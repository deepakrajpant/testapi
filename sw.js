// Listen for fetch events
self.addEventListener('fetch', event => {
  // Check if the request is a POST to "/api/multiply"
  if (event.request.url.endsWith('/api/multiply') && event.request.method === 'POST') {
    event.respondWith(
      (async function() {
        try {
          // Clone and read the request body as JSON
          const requestClone = event.request.clone();
          const requestData = await requestClone.json();

          // Validate input: must have a number property
          if (typeof requestData.number !== 'number') {
            return new Response(
              JSON.stringify({ error: "Invalid input. Please provide a number." }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          
          // Multiply the number by 2
          const result = requestData.number * 2;
          return new Response(
            JSON.stringify({ result: result }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Error processing request." }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }
      })()
    );
  }
});
