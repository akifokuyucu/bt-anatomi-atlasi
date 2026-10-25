"""Yerel geliştirme sunucusu: http.server + aralık isteği (HTTP 206) desteği.

Video modunda ileri-geri sarmak için tarayıcı Range isteği gönderir; yerleşik http.server bunu
desteklemez. GitHub Pages destekler, bu betik yalnızca yerel önizleme içindir.

Kullanım:
    python scripts/serve.py 8770 docs
"""
import functools
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        rng = self.headers.get("Range")
        path = self.translate_path(self.path)
        m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng or "")
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        a, b = m.groups()
        start = int(a) if a else max(0, size - int(b))
        end = min(int(b), size - 1) if a and b else size - 1
        if start >= size:
            self.send_error(416)
            return None
        f = open(path, "rb")
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        n = getattr(self, "_remaining", None)
        if n is None:
            return super().copyfile(source, outputfile)
        while n > 0:
            buf = source.read(min(65536, n))
            if not buf:
                break
            outputfile.write(buf)
            n -= len(buf)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    root = sys.argv[2] if len(sys.argv) > 2 else "docs"
    ThreadingHTTPServer(("", port), functools.partial(RangeHandler, directory=root)).serve_forever()
