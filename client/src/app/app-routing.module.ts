import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DetectObjectsComponent } from './detect-objects/detect-objects.component';

const routes: Routes = [
  { 
    path: 'detect',
    component: DetectObjectsComponent
  },
  { 
    path: '**',
    component: DetectObjectsComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    initialNavigation: 'enabled'
})],
  exports: [RouterModule]
})
export class AppRoutingModule { }
