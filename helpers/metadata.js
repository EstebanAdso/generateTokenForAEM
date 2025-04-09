// Ejemplo de uso:
export const astronautMetadata = {
    "class": "asset",
    "properties": {
        "dc:title": "Astronauta en el espacio",
        "dc:description": "Fotografía de astronauta flotando en la estación espacial internacional",
        "dc:creator": "NASA",
        "dc:rights": "Copyright © 2023 NASA/Roscosmos - Uso permitido con atribución",
        "dc:subject": [
            "astronauta",
            "espacio",
            "gravedad cero",
            "ISS"
        ],
        "dc:created": "2023-05-15T14:30:00Z",
        "cq:tags": [
            "space:astronaut",
            "mission:iss-63",
            "agency:nasa",
            "agency:roscosmos",
            "content-type:photography"
        ],
        "xmp:Rating": 5,
        "xmp:MetadataDate": "2023-11-20T09:15:00Z",
        "metadata": {
            "dc:format": "image/png",
            "cq:tags": [
                "properties:orientation/landscape",
                "properties:color/color",
                "properties:imageType/photograph"
            ]
        },
        "related": {
            "missions": ["ISS-63"],
            "astronauts": ["Alexander Skvortsov"]
        }
    }
};

export const earthMetadata = {
    "class": "asset",
    "properties": {
        "dc:title": "Planeta Tierra",
        "dc:description": "Fotografía de la Tierra tomada desde la Estación Espacial Internacional mostrando continentes y océanos",
        "dc:creator": "NASA/ESA",
        "dc:rights": "Copyright © 2023 NASA/ESA - Uso educativo permitido",
        "dc:subject": [
            "Tierra",
            "planeta",
            "atmósfera",
            "continentes",
            "océanos"
        ],
        "dc:created": "2023-04-22T08:15:00Z",
        "cq:tags": [
            "space:earth",
            "mission:iss-64",
            "agency:nasa",
            "agency:esa",
            "content-type:photography",
            "feature:blue-marble"
        ],
        "xmp:Rating": 4,
        "xmp:MetadataDate": "2023-12-10T10:20:00Z",
        "metadata": {
            "dc:format": "image/jpeg",
            "cq:tags": [
                "properties:orientation/landscape",
                "properties:color/color",
                "properties:imageType/satellite"
            ],
            "tiff:ImageWidth": "8192",
            "tiff:ImageLength": "5464"
        },
        "related": {
            "missions": ["ISS-64", "Blue Marble"],
            "spacecrafts": ["GOES-18", "Landsat 9"],
            "features": ["América del Norte", "Océano Pacífico"]
        },
        "exif:GPSLatitude": "23.5 N",
        "exif:GPSLongitude": "120.3 W",
        "dam:scene": ["daylight", "cloud-cover"]
    }
};

export const marsMetadata = {
    "class": "asset",
    "properties": {
        "dc:title": "Planeta Marte",
        "dc:description": "Vista de 360° del cráter Jezero en Marte capturada por el rover Perseverance",
        "dc:creator": "NASA/JPL-Caltech",
        "dc:rights": "Copyright © 2023 NASA/JPL-Caltech - Dominio público",
        "dc:subject": [
            "Marte",
            "rover",
            "Perseverance",
            "cráter Jezero",
            "superficie marciana"
        ],
        "dc:created": "2023-07-15T14:42:00Z",
        "cq:tags": [
            "space:mars",
            "mission:mars-2020",
            "agency:nasa",
            "agency:jpl",
            "content-type:panorama",
            "instrument:mastcam-z"
        ],
        "xmp:Rating": 5,
        "xmp:MetadataDate": "2023-11-30T16:45:00Z",
        "metadata": {
            "dc:format": "image/tiff",
            "cq:tags": [
                "properties:orientation/panoramic",
                "properties:color/color-enhanced",
                "properties:imageType/rover-capture"
            ],
            "tiff:ImageWidth": "12000",
            "tiff:ImageLength": "4000"
        },
        "related": {
            "missions": ["Mars 2020"],
            "instruments": ["Mastcam-Z", "SuperCam"],
            "locations": ["Crater Jezero"],
            "sols": ["Sol 450"]
        },
        "exif:GPSLatitude": "18.38 N",
        "exif:GPSLongitude": "77.58 E",
        "dam:scene": ["martian-day", "dusty"],
        "custom:atmosphericConditions": {
            "temperature": "-63°C",
            "pressure": "0.006 atm",
            "weather": "clear"
        }
    }
};

