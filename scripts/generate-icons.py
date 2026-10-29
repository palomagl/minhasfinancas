from PIL import Image, ImageOps
from pathlib import Path
from math import cos, sin, pi

icons = Path("icons")
img = Image.open(icons / "original-splash.png").convert("RGBA")
# Match the CSS used for the GREEN original wallet on the app opening.
angle = 170 * pi / 180
c, s = cos(angle), sin(angle)
matrix = (
  .213 + c*.787 - s*.213, .715 - c*.715 - s*.715, .072 - c*.072 + s*.928,
  .213 - c*.213 + s*.143, .715 + c*.285 + s*.140, .072 - c*.072 - s*.283,
  .213 - c*.213 - s*.787, .715 - c*.715 + s*.715, .072 + c*.928 + s*.072
)
def convert(pixel):
    r,g,b,a=pixel
    nr = matrix[0]*r + matrix[1]*g + matrix[2]*b
    ng = matrix[3]*r + matrix[4]*g + matrix[5]*b
    nb = matrix[6]*r + matrix[7]*g + matrix[8]*b
    gray=.2126*nr+.7152*ng+.0722*nb
    return tuple(max(0,min(255,round(gray*.14+v*.86))) for v in (nr,ng,nb))+(a,)
colored=Image.new("RGBA",img.size)
colored.putdata([convert(p) for p in img.getdata()])
# The source is the same actual wallet illustration displayed on startup.
# Keep its proportions; do not create another logo.
bbox=colored.getbbox()
if bbox:
    colored=colored.crop(bbox)
def build(size, path, margin=.10):
    field=Image.new("RGBA",(size,size),"#E5F3EB")
    max_side=int(size*(1-2*margin))
    art=colored.copy()
    art.thumbnail((max_side,max_side),Image.Resampling.LANCZOS)
    field.alpha_composite(art,((size-art.width)//2,(size-art.height)//2))
    field.convert("RGB").save(icons/path,"PNG",optimize=True)
for size,path in [(32,"favicon-32.png"),(180,"apple-touch-icon.png"),(192,"icon-192.png"),(512,"icon-512.png")]:
    build(size,path)
build(512,"icon-maskable-512.png",.23)
print("Rebuilt all 5 green icons from the original opening wallet.")
