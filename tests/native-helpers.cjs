// Runs in a fresh browser page. The mock follows WebK's cancellable promise
// contract and lets tests control transfer completion independently of the UI.
exports.nativeApi = () => {
  window.nativeCalls = [];
  window.makeMessage = (id, peerId = -1001, kind = 'video') => ({
    _: 'message', mid: id, peerId,
    media: kind === 'image' ? { photo: { _: 'photo', id: String(id), sizes: [] } } : {
      document: { _: 'document', id: String(id), mime_type: `${kind}/mp4`, file_name: `original.${id}.${kind === 'audio' ? 'm4a' : 'mp4'}` },
    },
  });
  window.appMediaViewer = { target: { message: makeMessage(1) } };
  window.appDownloadManager = {
    downloadToDisc({ media }) {
      const call = { media, cancelled: 0 };
      const operation = new Promise((resolve, reject) => { call.resolve = resolve; call.reject = reject; });
      operation.listeners = [];
      operation.addNotifyListener = listener => operation.listeners.push(listener);
      call.progress = (done, total) => operation.listeners.forEach(fn => fn({ done, total }));
      operation.cancel = () => { call.cancelled++; call.reject({ type: 'DOWNLOAD_CANCELED' }); };
      call.operation = operation;
      nativeCalls.push(call);
      return operation;
    },
  };
};
