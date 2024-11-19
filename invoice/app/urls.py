from django.urls import path
from . import views
# from .views import initialize_invoice_collection

# initialize_invoice_collection() 

urlpatterns = [
    path('', views.upload_document, name='upload_document'),
    path('remove-file/', views.remove_file, name='remove_file'),
    # path('mapping_rule/', views.mapping_rule, name='mapping_rule'),
    path('get-invoice-fields/', views.get_invoice_fields, name='get_invoice_fields'),
    path('insert_to_db/', views.insert_to_db, name='insert_to_db'),


    
]
