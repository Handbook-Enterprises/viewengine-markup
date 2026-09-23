// Permanent redirect markup.viewengine.ai -> markup.viewengine.dev, keeping path and query.
export default {
  fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'markup.viewengine.dev';
    return Response.redirect(url.toString(), 301);
  },
};
