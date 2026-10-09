window.postMessage(
  {
    channel: "renlu-x-followers-v1",
    type: "records",
    records: [
      ["demo_creator", 17456],
      ["demo_builder", 3200],
      ["demo_noise", 1250],
    ].map(([handle, count]) => ({ handle, count, at: Date.now() })),
  },
  location.origin,
);
