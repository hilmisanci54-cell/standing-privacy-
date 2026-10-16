"""espeak-ng (PyPI: espeakng-loader) ile Türkçe konuşma sentezi -> WAV. Yedek motor."""
import ctypes, wave, espeakng_loader

_lib = None; _rate = 22050
AUDIO_RETRIEVAL = 1
CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)

def _init():
    global _lib, _rate
    if _lib: return
    _lib = ctypes.CDLL(espeakng_loader.get_library_path())
    _lib.espeak_Initialize.restype = ctypes.c_int
    _rate = _lib.espeak_Initialize(AUDIO_RETRIEVAL, 0,
                                   espeakng_loader.get_data_path().encode(), 0)
    if _rate < 0: raise RuntimeError('espeak_Initialize başarısız')

def say(text, path, voice='tr', wpm=160, pitch=42, gap=6, volume=170):
    _init()
    buf = bytearray()
    @CB
    def cb(wav, n, ev):
        if wav and n > 0:
            buf.extend(ctypes.string_at(wav, n * 2))
        return 0
    _lib.espeak_SetSynthCallback(cb)
    if _lib.espeak_SetVoiceByName(voice.encode()) != 0:
        raise RuntimeError('ses bulunamadı: ' + voice)
    for p, v in ((1, wpm), (2, volume), (3, pitch), (7, gap)):
        _lib.espeak_SetParameter(p, v, 0)
    data = text.encode('utf-8')
    rc = _lib.espeak_Synth(data, len(data) + 1, 0, 0, 0, 1 | 0x1000, None, None)
    if rc != 0: raise RuntimeError('espeak_Synth hata %d' % rc)
    _lib.espeak_Synchronize()
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(_rate)
        w.writeframes(bytes(buf))
    return len(buf) / 2 / _rate

if __name__ == '__main__':
    import sys
    d = say('Penceresiz bir kutu. Çatıda soğutma grupları, yanda trafo sahası ve dizel jeneratörler.',
            sys.argv[1] if len(sys.argv) > 1 else 'test.wav')
    print('süre: %.2f sn · örnekleme: %d Hz' % (d, _rate))
