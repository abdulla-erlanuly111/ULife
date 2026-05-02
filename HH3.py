import h3

def generate_h3(latitude, length):
    return h3.latlng_to_cell(latitude, length, res=8)